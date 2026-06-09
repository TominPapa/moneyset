// DriveAdapter 구현 — Google Drive REST API
// 스펙 Section 11, 12 기준

import type {
  FileEnvelope,
  AppConfig,
  Transaction,
  SharedExpense,
  SettlementTransfer,
  ResetSession,
  Account,
  Liability,
  BudgetPlan,
  RecurringItem,
} from '../domain/types';
import type { DriveAdapter, Manifest, AppState, BackupMeta } from './driveAdapter';
import { DRIVE_FILE_NAMES } from './driveAdapter';

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const SCHEMA_VERSION = '1.0';

// ─── 내부 유틸 ────────────────────────────────────────────────────────────────

function makeEnvelope<T>(fileType: string, data: T): FileEnvelope<T> {
  return {
    schemaVersion: SCHEMA_VERSION,
    fileType,
    updatedAt: new Date().toISOString(),
    revisionHint: crypto.randomUUID(),
    data,
  };
}

export class DriveAdapterImpl implements DriveAdapter {
  private accessToken: string | null = null;
  private rootFolderId: string | null = null;
  /** 파일 ID 캐시: `${parentId}/${fileName}` → fileId */
  private fileIdCache = new Map<string, string>();
  /** 폴더 ID 캐시: `${parentId}/${folderName}` → folderId */
  private folderIdCache = new Map<string, string>();
  /** 동시 Silent Re-auth 요청 중복 방지 */
  private _silentReauthPromise: Promise<string> | null = null;

  // ─── 인증 ──────────────────────────────────────────────────────────────────

  isAuthenticated(): boolean {
    return this.accessToken !== null;
  }

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  async signIn(): Promise<void> {
    // @react-oauth/google 의 useGoogleLogin 훅으로 토큰 주입 후 setAccessToken 호출
    throw new Error('signIn은 LoginPage에서 useGoogleLogin 훅으로 처리합니다.');
  }

  async signOut(): Promise<void> {
    this.accessToken = null;
    this.rootFolderId = null;
    this.fileIdCache.clear();
    this.folderIdCache.clear();
  }

  // ─── Silent Re-auth (OAuth 토큰 만료 시 사용자 개입 없이 갱신) ─────────────

  /**
   * Google OAuth prompt=none hidden iframe 방식으로 새 access_token 획득.
   * 성공 시 새 토큰 반환, 실패(미로그인·동의 필요) 시 reject.
   */
  async silentReauth(): Promise<string> {
    return new Promise((resolve, reject) => {
      const TIMEOUT_MS = 30_000;
      const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string;
      if (!clientId) { reject(new Error('VITE_GOOGLE_CLIENT_ID 미설정')); return; }

      const scope = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/drive.appdata',
      ].join(' ');

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: window.location.origin,
        response_type: 'token',
        scope,
        include_granted_scopes: 'true',
        prompt: 'none',
      });

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:absolute;width:1px;height:1px;left:-9999px;top:-9999px;border:none;';
      iframe.src = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;

      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Silent re-auth timeout'));
      }, TIMEOUT_MS);

      const handleMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type === 'oauth_silent_token' && event.data?.token) {
          cleanup();
          resolve(event.data.token as string);
        } else if (event.data?.type === 'oauth_silent_error') {
          cleanup();
          reject(new Error(`Silent re-auth error: ${event.data.error}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timer);
        window.removeEventListener('message', handleMessage);
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };

      window.addEventListener('message', handleMessage);
      document.body.appendChild(iframe);
    });
  }

  // ─── 내부 fetch 래퍼 ──────────────────────────────────────────────────────

  private async fetch(url: string, options: RequestInit = {}): Promise<Response> {
    if (!this.accessToken) throw new Error('Drive 미인증 상태입니다.');

    const execRequest = (token: string) =>
      window.fetch(url, {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers ?? {}),
        },
      });

    let res = await execRequest(this.accessToken);

    // 401: OAuth 토큰 만료 → Silent Re-auth 후 1회 재시도
    if (res.status === 401) {
      try {
        // 동시에 여러 요청이 401을 받아도 re-auth는 한 번만 실행
        if (!this._silentReauthPromise) {
          this._silentReauthPromise = this.silentReauth().finally(() => {
            this._silentReauthPromise = null;
          });
        }
        const newToken = await this._silentReauthPromise;
        this.accessToken = newToken;
        sessionStorage.setItem('__oauth_token__', newToken);
        res = await execRequest(newToken);
      } catch {
        // Silent Re-auth 실패 → 원래 401 에러 그대로 전파 (로그인 화면 이동)
      }
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive API 오류 ${res.status}: ${text}`);
    }
    return res;
  }

  // ─── 파일 탐색 ────────────────────────────────────────────────────────────

  private async findFile(name: string, parentId: string): Promise<string | null> {
    const key = `${parentId}/${name}`;
    if (this.fileIdCache.has(key)) return this.fileIdCache.get(key)!;
    const q = encodeURIComponent(
      `name='${name}' and '${parentId}' in parents and trashed=false`
    );
    const res = await this.fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`);
    const json = await res.json() as { files: { id: string }[] };
    const id = json.files[0]?.id ?? null;
    if (id) this.fileIdCache.set(key, id);
    return id;
  }

  private async findFolder(name: string, parentId?: string): Promise<string | null> {
    if (parentId) {
      const key = `${parentId}/${name}`;
      if (this.folderIdCache.has(key)) return this.folderIdCache.get(key)!;
    }
    const parentClause = parentId ? ` and '${parentId}' in parents` : '';
    const q = encodeURIComponent(
      `name='${name}' and mimeType='application/vnd.google-apps.folder'${parentClause} and trashed=false`
    );
    const res = await this.fetch(`${DRIVE_API}/files?q=${q}&fields=files(id)`);
    const json = await res.json() as { files: { id: string }[] };
    const id = json.files[0]?.id ?? null;
    if (id && parentId) this.folderIdCache.set(`${parentId}/${name}`, id);
    return id;
  }

  private async createFolder(name: string, parentId?: string): Promise<string> {
    const metadata = {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    };
    const res = await this.fetch(`${DRIVE_API}/files`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(metadata),
    });
    const json = await res.json() as { id: string };
    return json.id;
  }

  // ─── 파일 읽기/쓰기 ──────────────────────────────────────────────────────

  private async readJson<T>(fileId: string): Promise<T> {
    const res = await this.fetch(`${DRIVE_API}/files/${fileId}?alt=media`);
    return res.json() as Promise<T>;
  }

  private async writeJson(
    name: string,
    parentId: string,
    data: unknown,
    existingFileId?: string,
  ): Promise<string> {
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });

    if (existingFileId) {
      // 업데이트
      const res = await this.fetch(
        `${UPLOAD_API}/files/${existingFileId}?uploadType=media`,
        { method: 'PATCH', body: blob, headers: { 'Content-Type': 'application/json' } },
      );
      const json = await res.json() as { id: string };
      return json.id;
    }

    // 신규 생성 (multipart)
    const metadata = JSON.stringify({ name, parents: [parentId] });
    const boundary = '-------reset_budget_boundary';
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      metadata,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      await blob.text(),
      `--${boundary}--`,
    ].join('\r\n');

    const res = await this.fetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
      {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body,
      },
    );
    const json = await res.json() as { id: string };
    return json.id;
  }

  // ─── 장부 관리 ────────────────────────────────────────────────────────────

  async createLedger(name: string): Promise<string> {
    const rootId = await this.createFolder(name);
    await this.createFolder('months', rootId);
    await this.createFolder('shared', rootId);
    await this.createFolder('resets', rootId);
    await this.createFolder('reports', rootId);
    await this.createFolder('backups', rootId);
    this.rootFolderId = rootId;

    const manifest: Manifest = {
      schemaVersion: SCHEMA_VERSION,
      ledgerId: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      lastUpdatedAt: new Date().toISOString(),
      activeMonths: [],
      lastOpenedMonth: new Date().toISOString().slice(0, 7),
      rootFolderId: rootId,
    };
    await this.writeJson(DRIVE_FILE_NAMES.manifest, rootId, manifest);
    return rootId;
  }

  async findExistingLedger(): Promise<string | null> {
    return this.findFolder('RESET Budget');
  }

  async openLedger(rootFolderId: string): Promise<Manifest> {
    // Drive에서 폴더 실제 존재 여부 확인 (사용자가 삭제·휴지통 이동한 경우 감지)
    const res = await this.fetch(`${DRIVE_API}/files/${rootFolderId}?fields=id,trashed`);
    const folderInfo = await res.json() as { id: string; trashed?: boolean };
    if (folderInfo.trashed) {
      throw new Error(`Drive API 오류 404: ledger folder is trashed (${rootFolderId})`);
    }
    this.rootFolderId = rootFolderId;
    return { rootFolderId } as Manifest;
  }

  /** 로그인 최적화: 루트 및 하위 폴더(months, shared, resets)의 파일 ID를 일괄 조회해 캐싱 */
  async warmCache(_ym: string): Promise<void> {
    const rootId = this.rootFolderId;
    if (!rootId) return;

    // 루트 폴더 파일 목록 조회 (config, accounts, liabilities, manifest + 하위 폴더)
    const rootRes = await this.fetch(
      `${DRIVE_API}/files?q=${encodeURIComponent(`'${rootId}' in parents and trashed=false`)}&fields=files(id,name,mimeType)&pageSize=100`
    );
    const rootJson = await rootRes.json() as { files: { id: string; name: string; mimeType: string }[] };

    let monthsFolderId: string | null = null;
    let sharedFolderId: string | null = null;
    let resetsFolderId: string | null = null;

    for (const f of rootJson.files) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        this.folderIdCache.set(`${rootId}/${f.name}`, f.id);
        if (f.name === 'months') monthsFolderId = f.id;
        if (f.name === 'shared') sharedFolderId = f.id;
        if (f.name === 'resets') resetsFolderId = f.id;
      } else {
        this.fileIdCache.set(`${rootId}/${f.name}`, f.id);
      }
    }

    // 하위 폴더 파일 목록 일괄 조회
    const fetchPromises: Promise<void>[] = [];

    const cacheFolderFiles = (folderId: string) => {
      return this.fetch(
        `${DRIVE_API}/files?q=${encodeURIComponent(`'${folderId}' in parents and trashed=false`)}&fields=files(id,name)&pageSize=100`
      )
        .then((res) => res.json())
        .then((json) => {
          const files = (json as { files: { id: string; name: string }[] }).files;
          for (const f of files) {
            this.fileIdCache.set(`${folderId}/${f.name}`, f.id);
          }
        })
        .catch(() => {});
    };

    if (monthsFolderId) fetchPromises.push(cacheFolderFiles(monthsFolderId));
    if (sharedFolderId) fetchPromises.push(cacheFolderFiles(sharedFolderId));
    if (resetsFolderId) fetchPromises.push(cacheFolderFiles(resetsFolderId));

    await Promise.allSettled(fetchPromises);
  }

  // ─── Manifest ─────────────────────────────────────────────────────────────

  async readManifest(): Promise<Manifest> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(DRIVE_FILE_NAMES.manifest, folderId);
    if (!fileId) throw new Error('manifest.json을 찾을 수 없습니다.');
    return this.readJson<Manifest>(fileId);
  }

  async writeManifest(manifest: Manifest): Promise<void> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(DRIVE_FILE_NAMES.manifest, folderId);
    await this.writeJson(DRIVE_FILE_NAMES.manifest, folderId, manifest, fileId ?? undefined);
  }

  // ─── AppConfig ────────────────────────────────────────────────────────────

  async readConfig(): Promise<FileEnvelope<AppConfig>> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(DRIVE_FILE_NAMES.config, folderId);
    if (!fileId) throw new Error('config.json을 찾을 수 없습니다.');
    return this.readJson(fileId);
  }

  async writeConfig(config: FileEnvelope<AppConfig>): Promise<void> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(DRIVE_FILE_NAMES.config, folderId);
    await this.writeJson(DRIVE_FILE_NAMES.config, folderId, config, fileId ?? undefined);
  }

  // ─── 자산/부채 ─────────────────────────────────────────────────────────────

  async readAccounts(): Promise<FileEnvelope<Account[]>> {
    return this.readMonoFile<Account[]>(DRIVE_FILE_NAMES.accounts, []);
  }
  async writeAccounts(data: FileEnvelope<Account[]>): Promise<void> {
    await this.writeMonoFile(DRIVE_FILE_NAMES.accounts, data);
  }

  async readLiabilities(): Promise<FileEnvelope<Liability[]>> {
    return this.readMonoFile<Liability[]>(DRIVE_FILE_NAMES.liabilities, []);
  }
  async writeLiabilities(data: FileEnvelope<Liability[]>): Promise<void> {
    await this.writeMonoFile(DRIVE_FILE_NAMES.liabilities, data);
  }

  // ─── 거래 (월별) ──────────────────────────────────────────────────────────

  async readTransactions(ym: string): Promise<FileEnvelope<Transaction[]>> {
    return this.readMonthFile<Transaction[]>(DRIVE_FILE_NAMES.monthTransactions(ym), 'months', []);
  }
  async writeTransactions(ym: string, data: FileEnvelope<Transaction[]>): Promise<void> {
    await this.writeMonthFile(DRIVE_FILE_NAMES.monthTransactions(ym), 'months', data);
  }

  // ─── 공동지출 (월별) ──────────────────────────────────────────────────────

  async readSharedExpenses(ym: string): Promise<FileEnvelope<SharedExpense[]>> {
    return this.readMonthFile<SharedExpense[]>(DRIVE_FILE_NAMES.monthSharedExpenses(ym), 'shared', []);
  }
  async writeSharedExpenses(ym: string, data: FileEnvelope<SharedExpense[]>): Promise<void> {
    await this.writeMonthFile(DRIVE_FILE_NAMES.monthSharedExpenses(ym), 'shared', data);
  }

  // ─── 정산 송금 ────────────────────────────────────────────────────────────

  async readSettlementTransfers(): Promise<FileEnvelope<SettlementTransfer[]>> {
    return this.readMonthFile<SettlementTransfer[]>(
      DRIVE_FILE_NAMES.settlementTransfers, 'shared', []
    );
  }
  async writeSettlementTransfers(data: FileEnvelope<SettlementTransfer[]>): Promise<void> {
    await this.writeMonthFile(DRIVE_FILE_NAMES.settlementTransfers, 'shared', data);
  }

  // ─── 리셋 세션 ────────────────────────────────────────────────────────────

  async readResetSessions(): Promise<FileEnvelope<ResetSession[]>> {
    return this.readMonthFile<ResetSession[]>(
      DRIVE_FILE_NAMES.resetSessions, 'resets', []
    );
  }
  async writeResetSessions(data: FileEnvelope<ResetSession[]>): Promise<void> {
    await this.writeMonthFile(DRIVE_FILE_NAMES.resetSessions, 'resets', data);
  }

  // ─── 예산 계획 (월별) ─────────────────────────────────────────────────────

  async readBudgetPlan(ym: string): Promise<FileEnvelope<BudgetPlan | null>> {
    return this.readMonthFile<BudgetPlan | null>(
      DRIVE_FILE_NAMES.monthBudgetPlan(ym), 'months', null,
    );
  }
  async writeBudgetPlan(ym: string, data: FileEnvelope<BudgetPlan>): Promise<void> {
    await this.writeMonthFile(DRIVE_FILE_NAMES.monthBudgetPlan(ym), 'months', data);
  }

  // ─── 정기지출 항목 (전체) ─────────────────────────────────────────────────

  async readRecurringItems(): Promise<FileEnvelope<RecurringItem[]>> {
    return this.readMonoFile<RecurringItem[]>(DRIVE_FILE_NAMES.recurringItems, []);
  }
  async writeRecurringItems(data: FileEnvelope<RecurringItem[]>): Promise<void> {
    await this.writeMonoFile(DRIVE_FILE_NAMES.recurringItems, data);
  }

  // ─── AppState (appDataFolder) ─────────────────────────────────────────────

  async readAppState(): Promise<AppState | null> {
    const q = encodeURIComponent(
      `name='app_state.json' and 'appDataFolder' in parents and trashed=false`
    );
    const res = await this.fetch(`${DRIVE_API}/files?q=${q}&spaces=appDataFolder&fields=files(id)`);
    const json = await res.json() as { files: { id: string }[] };
    const fileId = json.files[0]?.id;
    if (!fileId) return null;
    return this.readJson<AppState>(fileId);
  }

  async writeAppState(state: AppState): Promise<void> {
    const q = encodeURIComponent(
      `name='app_state.json' and 'appDataFolder' in parents and trashed=false`
    );
    const res = await this.fetch(`${DRIVE_API}/files?q=${q}&spaces=appDataFolder&fields=files(id)`);
    const json = await res.json() as { files: { id: string }[] };
    const existingId = json.files[0]?.id;

    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    if (existingId) {
      await this.fetch(`${UPLOAD_API}/files/${existingId}?uploadType=media`, {
        method: 'PATCH',
        body: blob,
        headers: { 'Content-Type': 'application/json' },
      });
    } else {
      const metadata = JSON.stringify({ name: 'app_state.json', parents: ['appDataFolder'] });
      const boundary = '-------reset_budget_appdata';
      const body = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        metadata,
        `--${boundary}`,
        'Content-Type: application/json',
        '',
        await blob.text(),
        `--${boundary}--`,
      ].join('\r\n');
      await this.fetch(`${UPLOAD_API}/files?uploadType=multipart&spaces=appDataFolder`, {
        method: 'POST',
        headers: { 'Content-Type': `multipart/related; boundary="${boundary}"` },
        body,
      });
    }
  }

  // ─── 백업 스냅샷 ──────────────────────────────────────────────────────────

  async listBackups(): Promise<BackupMeta[]> {
    const rootId = this.requireRoot();
    const backupsFolderId = await this.findFolder('backups', rootId);
    if (!backupsFolderId) return [];

    const q = encodeURIComponent(`'${backupsFolderId}' in parents and trashed=false`);
    const res = await this.fetch(
      `${DRIVE_API}/files?q=${q}&fields=files(id,name,modifiedTime)&orderBy=${encodeURIComponent('name desc')}&pageSize=20`,
    );
    const json = await res.json() as { files: { id: string; name: string; modifiedTime: string }[] };

    return json.files
      .filter((f) => f.name.startsWith('snapshot_') && f.name.endsWith('.json'))
      .map((f) => ({
        date: f.name.slice(9, 19),   // 'snapshot_'.length = 9, date = 10 chars (YYYY-MM-DD)
        fileId: f.id,
        savedAt: f.modifiedTime,
      }));
  }

  async readBackupRaw(fileId: string): Promise<unknown> {
    return this.readJson<unknown>(fileId);
  }

  async writeBackup(date: string, data: unknown): Promise<string> {
    const rootId = this.requireRoot();
    let backupsFolderId = await this.findFolder('backups', rootId);
    if (!backupsFolderId) backupsFolderId = await this.createFolder('backups', rootId);

    const fileName = `snapshot_${date}.json`;
    const existingId = await this.findFile(fileName, backupsFolderId);
    const fileId = await this.writeJson(fileName, backupsFolderId, data, existingId ?? undefined);
    // 파일 ID 캐시 갱신
    this.fileIdCache.set(`${backupsFolderId}/${fileName}`, fileId);
    return fileId;
  }

  async deleteBackup(fileId: string): Promise<void> {
    await this.fetch(`${DRIVE_API}/files/${fileId}`, { method: 'DELETE' });
  }

  // ─── 내부 헬퍼 ────────────────────────────────────────────────────────────

  private requireRoot(): string {
    if (!this.rootFolderId) throw new Error('장부가 열려있지 않습니다. openLedger()를 먼저 호출하세요.');
    return this.rootFolderId;
  }

  private async readMonoFile<T>(
    fileName: string,
    defaultData: T,
  ): Promise<FileEnvelope<T>> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(fileName, folderId);
    if (!fileId) return makeEnvelope(fileName, defaultData);
    return this.readJson(fileId);
  }

  private async writeMonoFile(fileName: string, data: FileEnvelope<unknown>): Promise<void> {
    const folderId = this.requireRoot();
    const fileId = await this.findFile(fileName, folderId);
    await this.writeJson(fileName, folderId, data, fileId ?? undefined);
  }

  private async readMonthFile<T>(
    filePath: string,
    subFolder: string,
    defaultData: T,
  ): Promise<FileEnvelope<T>> {
    const rootId = this.requireRoot();
    const folderId = await this.findFolder(subFolder, rootId);
    if (!folderId) return makeEnvelope(filePath, defaultData);
    const fileName = filePath.split('/').pop()!;
    const fileId = await this.findFile(fileName, folderId);
    if (!fileId) return makeEnvelope(filePath, defaultData);
    return this.readJson(fileId);
  }

  private async writeMonthFile(
    filePath: string,
    subFolder: string,
    data: FileEnvelope<unknown>,
  ): Promise<void> {
    const rootId = this.requireRoot();
    let folderId = await this.findFolder(subFolder, rootId);
    if (!folderId) folderId = await this.createFolder(subFolder, rootId);
    const fileName = filePath.split('/').pop()!;
    const fileId = await this.findFile(fileName, folderId);
    await this.writeJson(fileName, folderId, data, fileId ?? undefined);
  }
}

export const driveAdapter = new DriveAdapterImpl();
