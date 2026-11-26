// API pública do módulo contas: a única porta de entrada para as outras features.
//
// - request.user: SessionUser | null (visitante = null), carregado do banco a cada requisição.
// - Tudo sob /organizador já é protegido por um hook global; requireOrganizer pode ser declarado
//   por clareza. O dono de um recurso vem de currentUser(request).id, nunca de campo de formulário.
// - requireParticipant(options?) protege páginas de participante com volta à origem após o login.
export type { Role, SessionUser } from './types.js';
export { currentUser, requireOrganizer, requireParticipant, type RequireParticipantOptions } from './guards.js';
export { loginPath, safeReturnPath } from './return-path.js';
export { SESSION_COOKIE_NAME } from './cookie.js';
