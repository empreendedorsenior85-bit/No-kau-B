"use client";
/** Há uma conta de cliente com sessão neste navegador? (indicação para a interface; o servidor valida sempre a sessão real) */
export const hasClientHint = () => (typeof document !== "undefined" && /(?:^|;\s*)nk_has_client=1(?:;|$)/.test(document.cookie) ? 1 : 0);
