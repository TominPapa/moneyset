// authFlags — 로그인 흐름에서 화면 사이에 넘기는 1회용 플래그

/** 업그레이드 화면의 "다른 계정으로 로그인"에서 세우는 플래그 (sessionStorage).
 *  이게 없으면 구글이 이미 동의한 계정으로 계정 선택 없이 바로 로그인시켜,
 *  버튼을 눌러도 같은 계정으로 되돌아오는 것처럼 보인다. */
export const SELECT_ACCOUNT_FLAG = '__select_account__';
