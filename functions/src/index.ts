import * as admin from 'firebase-admin';
import { HttpsError, onCall } from 'firebase-functions/v2/https';

admin.initializeApp();
const db = admin.firestore();

type SaaSRole = 'superadmin' | 'admin' | 'assistant' | 'artist' | 'asistente' | 'artista';
type SaaSStatus = 'active' | 'inactive';

interface UserPayload {
  companyId: string;
  displayName: string;
  email: string;
  role: SaaSRole;
  status: SaaSStatus;
}

const assertAuth = (uid?: string): string => {
  if (!uid) throw new HttpsError('unauthenticated', 'Authentication required.');
  return uid;
};

const getActor = async (uid: string) => {
  const actorSnap = await db.collection('usuarios').doc(uid).get();
  if (!actorSnap.exists) throw new HttpsError('permission-denied', 'Actor profile not found.');
  return actorSnap.data() as Record<string, unknown>;
};

const assertPrivilegedRole = (role: unknown) => {
  if (role !== 'admin' && role !== 'superadmin') {
    throw new HttpsError('permission-denied', 'Insufficient role.');
  }
};

const assertSameTenant = (actorCompanyId: unknown, targetCompanyId: string) => {
  if (typeof actorCompanyId !== 'string' || actorCompanyId !== targetCompanyId) {
    throw new HttpsError('permission-denied', 'Cross-tenant access denied.');
  }
};

/**
 * Compatibilidad para perfiles legacy sin companyId:
 * si el actor privilegiado aún no tiene tenant asignado, se inicializa con
 * el companyId del payload actual para evitar bloqueos operativos del MVP.
 */
const resolveActorCompanyId = async (uid: string, actor: Record<string, unknown>, payloadCompanyId: string): Promise<string> => {
  const actorCompanyId = actor.companyId;
  if (typeof actorCompanyId === 'string' && actorCompanyId) return actorCompanyId;

  await db.collection('usuarios').doc(uid).set(
    {
      companyId: payloadCompanyId,
      updatedAt: new Date().toISOString(),
      updatedBy: uid,
    },
    { merge: true },
  );
  return payloadCompanyId;
};

export const createUser = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const actor = await getActor(uid);
  assertPrivilegedRole(actor.role ?? actor.rol);

  const payload = request.data as UserPayload & { password?: string };
  if (!payload?.companyId || !payload?.email || !payload?.displayName || !payload?.role || !payload?.status) {
    throw new HttpsError('invalid-argument', 'Invalid payload.');
  }

  const actorCompanyId = await resolveActorCompanyId(uid, actor, payload.companyId);
  assertSameTenant(actorCompanyId, payload.companyId);

  const created = await admin.auth().createUser({
    email: payload.email.trim().toLowerCase(),
    password: payload.password?.trim() || undefined,
    displayName: payload.displayName.trim(),
    disabled: payload.status === 'inactive',
  });

  const now = new Date().toISOString();
  await db.collection('usuarios').doc(created.uid).set({
    id: created.uid,
    companyId: payload.companyId,
    displayName: payload.displayName.trim(),
    nombre: payload.displayName.trim(),
    email: payload.email.trim().toLowerCase(),
    role: payload.role,
    rol: payload.role,
    status: payload.status,
    activo: payload.status === 'active',
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
    fechaCreacion: now,
  });

  console.log('[createUser]', { actor: uid, createdUid: created.uid, companyId: payload.companyId });
  return { userId: created.uid };
});

export const updateUser = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const actor = await getActor(uid);
  assertPrivilegedRole(actor.role ?? actor.rol);

  const payload = request.data as {
    userId: string;
    companyId: string;
    displayName: string;
    role: SaaSRole;
    status: SaaSStatus;
  };

  if (!payload?.userId || !payload?.companyId || !payload?.displayName || !payload?.role || !payload?.status) {
    throw new HttpsError('invalid-argument', 'Invalid payload.');
  }

  const actorCompanyId = await resolveActorCompanyId(uid, actor, payload.companyId);
  assertSameTenant(actorCompanyId, payload.companyId);

  const targetRef = db.collection('usuarios').doc(payload.userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'Target user not found.');

  const target = targetSnap.data() as Record<string, unknown>;
  assertSameTenant(target.companyId, payload.companyId);

  await admin.auth().updateUser(payload.userId, {
    displayName: payload.displayName.trim(),
    disabled: payload.status === 'inactive',
  });

  await targetRef.update({
    displayName: payload.displayName.trim(),
    nombre: payload.displayName.trim(),
    role: payload.role,
    rol: payload.role,
    status: payload.status,
    activo: payload.status === 'active',
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  });

  console.log('[updateUser]', { actor: uid, target: payload.userId, companyId: payload.companyId });
  return { ok: true };
});

export const toggleUserStatus = onCall(async (request) => {
  const uid = assertAuth(request.auth?.uid);
  const actor = await getActor(uid);
  assertPrivilegedRole(actor.role ?? actor.rol);

  const payload = request.data as { userId: string; companyId: string; status: SaaSStatus };
  if (!payload?.userId || !payload?.companyId || !payload?.status) {
    throw new HttpsError('invalid-argument', 'Invalid payload.');
  }

  const actorCompanyId = await resolveActorCompanyId(uid, actor, payload.companyId);
  assertSameTenant(actorCompanyId, payload.companyId);

  const targetRef = db.collection('usuarios').doc(payload.userId);
  const targetSnap = await targetRef.get();
  if (!targetSnap.exists) throw new HttpsError('not-found', 'Target user not found.');

  const target = targetSnap.data() as Record<string, unknown>;
  assertSameTenant(target.companyId, payload.companyId);

  await admin.auth().updateUser(payload.userId, { disabled: payload.status === 'inactive' });
  await targetRef.update({
    status: payload.status,
    activo: payload.status === 'active',
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  });

  console.log('[toggleUserStatus]', { actor: uid, target: payload.userId, status: payload.status });
  return { ok: true };
});
