export const PB_URL = 'https://pbbargo.pierre-mouilleseaux-lhuillier.fr';

/**
 * Construit l'URL d'une image PocketBase.
 * @param {Object} record - L'enregistrement PocketBase (doit contenir collectionName et id)
 * @param {string} filename - Le nom du fichier image
 */
export function getImageUrl(record, filename) {
  return `${PB_URL}/api/files/${record.collectionName}/${record.id}/${filename}`;
}

/**
 * Récupère tous les enregistrements d'une collection PocketBase.
 * @param {string} collection - Nom de la collection
 * @param {Object} params - Paramètres optionnels (sort, filter, expand…)
 * @returns {Promise<Array>} Liste des enregistrements
 */
export async function getCollection(collection, params = {}) {
  const query = new URLSearchParams({ perPage: 50, ...params });
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records?${query}`);
  const data = await res.json();
  return data.items ?? [];
}

/**
 * Récupère un seul enregistrement par son ID.
 * @param {string} collection - Nom de la collection
 * @param {string} id - ID de l'enregistrement
 */
export async function getRecord(collection, id) {
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records/${id}`);
  return await res.json();
}

/** Authentifie un utilisateur, retourne { token, record } ou null. */
export async function loginUser(email, password) {
  const res = await fetch(`${PB_URL}/api/collections/users/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: email, password })
  });
  if (!res.ok) return null;
  return await res.json();
}

/** Crée un compte utilisateur. Retourne { record } ou { error }. */
export async function registerUser(data) {
  const res = await fetch(`${PB_URL}/api/collections/users/records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
  const json = await res.json();
  if (!res.ok) return { error: json };
  return { record: json };
}

/** Récupère un utilisateur authentifié (expand bar_favori, boisson_favori). */
export async function getUserAuth(userId, token) {
  const res = await fetch(
    `${PB_URL}/api/collections/users/records/${userId}?expand=bar_favori,boisson_favori,jeux_favori,demande_amies,amies,amies.equiper_avatar_decoration,demande_session,equiper_avatar_decoration,equiper_titre,equiper_theme,possed_avatar_decoration,possed_titre,possed_theme,items_favori`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  if (!res.ok) return null;
  return await res.json();
}

/** Met à jour un utilisateur (supporte FormData pour les fichiers). */
export async function updateUser(userId, token, data) {
  const isFormData = data instanceof FormData;
  const res = await fetch(`${PB_URL}/api/collections/users/records/${userId}`, {
    method: 'PATCH',
    headers: isFormData
      ? { Authorization: `Bearer ${token}` }
      : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: isFormData ? data : JSON.stringify(data)
  });
  if (!res.ok) return null;
  return await res.json();
}

/** Récupère une liste d'enregistrements avec authentification (token requis). */
export async function getCollectionAuth(collection, token, params = {}) {
  const query = new URLSearchParams({ perPage: 50, ...params });
  const res = await fetch(`${PB_URL}/api/collections/${collection}/records?${query}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = res.ok ? await res.json() : { items: [] };
  return data.items ?? [];
}

/** Supprime le compte utilisateur. */
export async function deleteUser(userId, token) {
  const res = await fetch(`${PB_URL}/api/collections/users/records/${userId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.ok;
}
