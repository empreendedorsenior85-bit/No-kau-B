import "server-only";
import { randomBytes } from "node:crypto";

/** 128 bits de aleatoriedade em base64url (22 caracteres): impossível de adivinhar. */
export const newQrToken = () => randomBytes(16).toString("base64url");
export const isQrToken = (t: string) => /^[A-Za-z0-9_-]{22}$/.test(t);
