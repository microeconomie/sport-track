# sport-track

Journal de sport déclaratif : on note chaque jour ses séances (activité, sensation, description, metrics),
on parcourt ses semaines (lundi → dimanche, numéro ISO, heure de Paris) et on suit l'évolution de chaque
metric dans l'onglet Stats. Allure et vitesse ne se saisissent pas : elles sont calculées à partir de la
distance et de la durée.

**URL** : https://microeconomie.github.io/sport-track/ — installable sur l'écran d'accueil de l'iPhone
(Safari → Partager → « Sur l'écran d'accueil »).

## Stack

HTML/CSS/JS vanilla, sans build (`index.html`, `style.css`, `app.js`), supabase-js via CDN, publié par
GitHub Pages depuis la branche `main`. Le design reprend la maquette validée `sport-track.html`.

Backend : projet Supabase partagé **aimeri-unique** (avec aimeri-todo et ideel-like). Même compte et même
session que les autres apps. Connexion e-mail + mot de passe uniquement.

## Profils (mesures liées à l'icône de l'activité)

| Profil | Icônes | Champs saisis | Calculés à l'enregistrement |
|---|---|---|---|
| Course | `directions_run`, `sprint` | distance (km), durée | allure, vitesse moyenne |
| Vélo | `directions_bike` | durée, distance (km) | vitesse moyenne |
| Natation | `pool` | durée, longueurs | — |
| Randonnée | `hiking` | durée, distance (km), dénivelé positif (m D+) | — |

Pour ces activités, la fiche séance affiche directement ces champs. Les autres activités ont une section
« Exercices » (séries × kg × reps), préremplie avec les exercices de la dernière séance de l'activité.
La durée se saisit en heures et minutes. Allure = durée / distance (arrondie à la seconde), vitesse =
distance / heures (1 décimale).

## Base de données

Tables du schéma `public`, toutes préfixées `st_`, RLS activée (`auth.uid() = user_id`, rôle
`authenticated` seulement, aucun droit pour `anon`). SQL : `sql/001_sport_track.sql` (création) puis
`sql/002_profiles.sql` (profils).

| Table | Colonnes | Notes |
|---|---|---|
| `st_activities` | id, user_id, name (40), subtitle (80, facultatif), icon (Material Symbols), color (c1…c12), position, created_at | l'icône détermine le profil |
| `st_metrics` | id, user_id, name (40), type, unit, profile, position, created_at | voir ci-dessous |
| `st_sessions` | id, user_id, activity_id, date, description (250), rating (0–5), created_at, updated_at | unique (user_id, activity_id, date) ; pas de date future (trigger, Europe/Paris) ; supprimée avec son activité |
| `st_session_values` | session_id, metric_id, value, sets, kg, reps | clé (session_id, metric_id) ; RLS via la séance parente ; supprimée avec sa séance ou son exercice |

`st_metrics` contient deux sortes de lignes :
- **Mesures intégrées** (`profile` = run, bike, swim ou hike) : une par couple profil / type, par exemple
  Course · Distance et Vélo · Distance sont distinctes. Ni modifiables ni supprimables (RLS).
  Types : distance, duration, pace, speed, number (longueurs, m D+ ; `unit` renseignée).
- **Exercices** (`profile` null) : toujours de type `sets`, créés, renommés et supprimés librement.

Unités de `value` : km (distance), secondes (durée, multiple de 60 pour les saisies), secondes/km (allure),
km/h (vitesse), nombre (longueurs, mètres). Le type `sets` utilise `sets`, `kg` et `reps`.

Fonctions (SECURITY INVOKER, donc soumises au RLS) :
- `st_ensure_defaults()`, appelée à chaque démarrage : crée les mesures intégrées manquantes et, au
  premier lancement, les activités de départ et l'exercice « Exercice biceps ».
- `st_save_session(...)` crée ou modifie une séance et remplace ses valeurs en une transaction.

Le SQL est appliqué dans une transaction avec `npx supabase db query --linked -f sql/<fichier>.sql`
(depuis le dossier ideel-like, relié au projet), hors de l'historique de migrations de la CLI, qui
appartient à ideel-like.
