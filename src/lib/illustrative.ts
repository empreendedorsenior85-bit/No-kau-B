/** Fotografias geradas por IA (Higgsfield): não são os pratos reais e têm de ser assinaladas como ilustrativas. */
export const ILLUSTRATIVE_DIR = "/menu/ilustrativas/";
export const isIllustrative = (url: string | null | undefined) => !!url && url.startsWith(ILLUSTRATIVE_DIR);
