/**
 * Para onde o cliente pode voltar depois de entrar/criar conta: só caminhos conhecidos (sem redirecionamentos abertos).
 * Usado pelas páginas e pelas ações de login/registo — uma só lista.
 */
export const safeVolta = (v: unknown): string =>
  typeof v === "string" && (
    /^\/m\/[A-Za-z0-9_-]{22}(\?carrinho=1)?$/.test(v)
    || /^\/cliente\/recibos\/[0-9a-f-]{36}$/.test(v)
    || /^\/cliente(\/(reservas|pagamentos|pedidos))?$/.test(v)
  ) ? v : "/cliente";
