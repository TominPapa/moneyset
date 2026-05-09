// AmountInput — 원화 숫자 입력 (1,000원 형식)
// value/onChange는 실제 숫자(number)로 주고받는다.

import { useState, useCallback } from 'react';
import styles from './AmountInput.module.css';

interface AmountInputProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  placeholder?: string;
  error?: string;
  hint?: string;
  min?: number;
  max?: number;
  required?: boolean;
  id?: string;
}

function formatKRW(n: number): string {
  if (n === 0) return '';
  return n.toLocaleString('ko-KR');
}

function parseKRW(s: string): number {
  const cleaned = s.replace(/[^0-9]/g, '');
  if (!cleaned) return 0;
  return Math.min(Number(cleaned), 9_999_999_999);
}

export function AmountInput({
  label,
  value,
  onChange,
  placeholder = '0',
  error,
  hint,
  required,
  id,
}: AmountInputProps) {
  const [displayValue, setDisplayValue] = useState(() => formatKRW(value));
  const inputId = id ?? label?.replace(/\s+/g, '_').toLowerCase();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      const parsed = parseKRW(raw);
      setDisplayValue(parsed === 0 ? '' : formatKRW(parsed));
      onChange(parsed);
    },
    [onChange],
  );

  const handleBlur = useCallback(() => {
    setDisplayValue(formatKRW(value));
  }, [value]);

  const handleFocus = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      // 포커스 시 커서를 끝으로
      const len = e.target.value.length;
      e.target.setSelectionRange(len, len);
    },
    [],
  );

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
          {required && <span className={styles.required}> *</span>}
        </label>
      )}
      <div className={styles.inputWrapper}>
        <input
          id={inputId}
          type="text"
          inputMode="numeric"
          value={displayValue}
          onChange={handleChange}
          onBlur={handleBlur}
          onFocus={handleFocus}
          placeholder={placeholder}
          className={[styles.input, error ? styles.inputError : ''].filter(Boolean).join(' ')}
          aria-label={label}
        />
        <span className={styles.unit}>원</span>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!error && hint && <p className={styles.hint}>{hint}</p>}
    </div>
  );
}
