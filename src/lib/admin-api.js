// =====================================================================
// BARGO : utilitaires des routes /api/admin/* (validation, images).
// Chaque route commence par exigerAdmin(locals) (src/lib/api.js) AVANT
// d'appeler quoi que ce soit d'ici.
// =====================================================================
import { erreur } from './api.js';
import {
  detecterImage,
  TAILLE_MAX_IMAGE,
  nouvelleCleImage,
  ecrireFichier,
  supprimerFichier,
  cleValide,
} from './stockage.js';

/** Erreur de validation : message renvoyé tel quel au client. */
export class ErreurAdmin extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Exécute le traitement d'une route et convertit les erreurs en réponse JSON. */
export async function proteger(traitement) {
  try {
    return await traitement();
  } catch (e) {
    if (e instanceof ErreurAdmin) return erreur(e.message, e.status);
    // Message seulement : jamais de données de la requête dans les journaux.
    console.error('[admin] erreur interne :', e?.message ?? 'inconnue');
    return erreur('Erreur interne.', 500);
  }
}

const REGEX_ID = /^[A-Za-z0-9_-]{1,40}$/;

/**
 * Identifiant de ressource valide (sinon 404 : on ne dit pas pourquoi).
 * Avec `optionnel`, retourne null quand l'URL n'en contient pas (route de création).
 */
export function idDeParams(params, optionnel = false) {
  const id = params?.id;
  if (optionnel && (id === undefined || id === '')) return null;
  if (typeof id !== 'string' || !REGEX_ID.test(id)) throw new ErreurAdmin('Introuvable.', 404);
  return id;
}

// Corps maximum accepté pour un envoi de fichiers (plusieurs images de 5 Mo).
const CORPS_MAX = 80 * 1024 * 1024;

/** Lit un corps multipart (FormData) ; 400/413 si invalide ou trop gros. */
export async function lireFormData(request) {
  const taille = Number(request.headers.get('content-length'));
  if (Number.isFinite(taille) && taille > CORPS_MAX) throw new ErreurAdmin('Envoi trop volumineux.', 413);
  const type = request.headers.get('content-type') ?? '';
  if (!/^(multipart\/form-data|application\/x-www-form-urlencoded)/i.test(type)) {
    throw new ErreurAdmin('Format de requête invalide.');
  }
  try {
    return await request.formData();
  } catch {
    throw new ErreurAdmin('Formulaire invalide.');
  }
}

/** Texte d'un champ de formulaire/JSON : trim, longueur max ; chaîne vide -> null si !requis. */
export function lireTexte(valeur, { max, requis = false, nom = 'Champ' }) {
  if (valeur === undefined || valeur === null) {
    if (requis) throw new ErreurAdmin(`${nom} : champ obligatoire.`);
    return null;
  }
  if (typeof valeur !== 'string') throw new ErreurAdmin(`${nom} : valeur invalide.`);
  const t = valeur.trim();
  if (t === '') {
    if (requis) throw new ErreurAdmin(`${nom} : champ obligatoire.`);
    return null;
  }
  if (t.length > max) throw new ErreurAdmin(`${nom} : ${max} caractères maximum.`);
  return t;
}

/** Nombre décimal dans [min, max] ; chaîne vide -> null. */
export function lireNombre(valeur, { min, max, nom = 'Valeur' }) {
  if (valeur === undefined || valeur === null || (typeof valeur === 'string' && valeur.trim() === '')) return null;
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < min || n > max) throw new ErreurAdmin(`${nom} : valeur invalide.`);
  return n;
}

/** Entier dans [min, max] (pas de valeur vide). */
export function lireEntier(valeur, { min, max, nom = 'Valeur' }) {
  if (typeof valeur === 'string' && valeur.trim() === '') throw new ErreurAdmin(`${nom} : champ obligatoire.`);
  const n = typeof valeur === 'number' ? valeur : Number(String(valeur ?? '').trim());
  if (!Number.isSafeInteger(n) || n < min || n > max) throw new ErreurAdmin(`${nom} : valeur invalide.`);
  return n;
}

/** Valeur parmi une liste fixe, sinon 400. */
export function lireChoix(valeur, autorises, nom = 'Valeur') {
  if (typeof valeur !== 'string' || !autorises.includes(valeur)) throw new ErreurAdmin(`${nom} : valeur invalide.`);
  return valeur;
}

function estFichier(v) {
  return v && typeof v === 'object' && typeof v.arrayBuffer === 'function' && typeof v.size === 'number';
}

/**
 * Images envoyées sous un nom de champ (0..n) : { buffer, ext }[].
 * Vérifie la taille et le VRAI format (octets magiques), pas le type déclaré.
 */
export async function lireImages(formData, champ, { maxNombre = 10 } = {}) {
  const fichiers = formData.getAll(champ).filter((f) => estFichier(f) && f.size > 0);
  if (fichiers.length > maxNombre) throw new ErreurAdmin(`Trop d'images (${maxNombre} maximum).`);
  const images = [];
  for (const f of fichiers) {
    if (f.size > TAILLE_MAX_IMAGE) throw new ErreurAdmin('Image trop lourde (5 Mo maximum).');
    const buffer = Buffer.from(await f.arrayBuffer());
    const ext = detecterImage(buffer);
    if (!ext) throw new ErreurAdmin('Image invalide (jpg, png, webp ou gif uniquement).');
    images.push({ buffer, ext });
  }
  return images;
}

/** Écrit les images dans le stockage et retourne leurs clés (nettoie en cas d'échec). */
export async function stockerImages(dossier, id, champ, images) {
  const cles = [];
  try {
    for (const { buffer, ext } of images) {
      const cle = nouvelleCleImage(dossier, id, champ, ext);
      await ecrireFichier(cle, buffer);
      cles.push(cle);
    }
  } catch (e) {
    await effacerFichiers(cles);
    throw e;
  }
  return cles;
}

/** Supprime des fichiers du stockage (erreurs journalisées sans détail, jamais bloquantes). */
export async function effacerFichiers(cles) {
  for (const cle of cles ?? []) {
    if (!cle || !cleValide(cle)) continue;
    try {
      await supprimerFichier(cle);
    } catch (e) {
      console.error('[admin] suppression de fichier impossible :', e?.code ?? 'erreur');
    }
  }
}

/** Liste de clés de fichiers à retirer (valeurs d'un champ répété). Seules les clés valides sont gardées. */
export function lireClesARetirer(formData, champ) {
  return formData.getAll(champ).filter((v) => typeof v === 'string' && cleValide(v));
}
