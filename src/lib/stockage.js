// =====================================================================
// Stockage des fichiers (images) de BARGO.
//
// Implémentation actuelle : disque local, dans UPLOAD_DIR (défaut data/uploads).
// Une "clé" identifie un fichier : "<dossier>/<id>/<champ>-<suffixe>.<ext>"
// (ex. bar/abc123/img-0.webp, avatar/xyz/avatar-k3j9x2.webp).
//
// REMPLAÇABLE PAR CLOUDFLARE R2 : seules 3 fonctions touchent au disque et
// sont à réécrire (le reste du fichier et tout le code appelant restent
// identiques) :
//   - lireFichier(cle)            -> R2 : bucket.get(cle)
//   - ecrireFichier(cle, donnees) -> R2 : bucket.put(cle, donnees, { httpMetadata })
//   - supprimerFichier(cle)       -> R2 : bucket.delete(cle)
// =====================================================================
import { getSecret } from 'astro:env/server';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const TAILLE_MAX_IMAGE = 5 * 1024 * 1024;

const DOSSIERS = ['bar', 'boisson', 'jeu', 'boutique', 'avatar'];
const EXTENSIONS = ['jpg', 'png', 'webp', 'gif'];
const REGEX_CLE = /^(bar|boisson|jeu|boutique|avatar)\/[A-Za-z0-9_-]{1,40}\/[A-Za-z0-9_-]{1,60}\.(jpg|png|webp|gif)$/;
const REGEX_SEGMENT = /^[A-Za-z0-9_-]+$/;

const TYPES = {
  jpg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
};

function racine() {
  const dossier = getSecret('UPLOAD_DIR') || 'data/uploads';
  return path.resolve(dossier);
}

// Chemin disque d'une clé valide ; null si la clé est invalide ou sort de la racine.
function cheminDisque(cle) {
  if (!cleValide(cle)) return null;
  const base = racine();
  const complet = path.resolve(base, ...cle.split('/'));
  if (!complet.startsWith(base + path.sep)) return null;
  return complet;
}

export function cleValide(cle) {
  return typeof cle === 'string' && REGEX_CLE.test(cle);
}

export function urlFichier(cle) {
  return cleValide(cle) ? '/fichiers/' + cle : null;
}

// Type MIME d'après l'extension de la clé (null si clé invalide).
export function typeDeCle(cle) {
  if (!cleValide(cle)) return null;
  return TYPES[cle.slice(cle.lastIndexOf('.') + 1)] ?? null;
}

// Détecte le format d'une image d'après ses octets magiques.
export function detecterImage(buffer) {
  if (!buffer || buffer.length < 12) return null;
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  const entete = buffer.subarray(0, 6).toString('latin1');
  if (entete === 'GIF87a' || entete === 'GIF89a') return 'gif';
  if (buffer.subarray(0, 4).toString('latin1') === 'RIFF' && buffer.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

// Nouvelle clé avec suffixe aléatoire court (évite le cache navigateur).
export function nouvelleCleImage(dossier, id, champ, ext) {
  if (!DOSSIERS.includes(dossier)) throw new Error('Dossier de stockage invalide');
  if (!REGEX_SEGMENT.test(String(id ?? '')) || !REGEX_SEGMENT.test(String(champ ?? ''))) {
    throw new Error('Identifiant ou champ invalide');
  }
  if (!EXTENSIONS.includes(ext)) throw new Error('Extension invalide');
  const suffixe = randomBytes(5).toString('hex').slice(0, 6);
  const cle = `${dossier}/${id}/${champ}-${suffixe}.${ext}`;
  if (!cleValide(cle)) throw new Error('Clé de fichier invalide');
  return cle;
}

// ---- Les 3 fonctions à réécrire pour Cloudflare R2 -------------------

export async function lireFichier(cle) {
  const chemin = cheminDisque(cle);
  if (!chemin) return null;
  try {
    const corps = await fs.readFile(chemin);
    return { corps, type: typeDeCle(cle), taille: corps.length };
  } catch (e) {
    if (e?.code === 'ENOENT' || e?.code === 'EISDIR' || e?.code === 'ENOTDIR') return null;
    throw e;
  }
}

export async function ecrireFichier(cle, donnees) {
  const chemin = cheminDisque(cle);
  if (!chemin) throw new Error('Clé de fichier invalide');
  await fs.mkdir(path.dirname(chemin), { recursive: true });
  await fs.writeFile(chemin, donnees);
}

export async function supprimerFichier(cle) {
  const chemin = cheminDisque(cle);
  if (!chemin) return;
  try {
    await fs.unlink(chemin);
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
  }
}
