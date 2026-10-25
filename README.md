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

## Base de données

Tables du schéma `public`, toutes préfixées `st_`, RLS activée (`auth.uid() = user_id`, rôle
`authenticated` seulement, aucun droit pour `anon`). Le SQL complet est dans `sql/001_sport_track.sql`.

| Table | Colonnes | Notes |
|---|---|---|
| `st_activities` | id, user_id, name (40), subtitle (80, facultatif), icon (Material Symbols), color (c1…c12), position, created_at | |
| `st_metrics` | id, user_id, name (40), type, unit, position, created_at | type : distance, duration, pace, speed, sets, number ; unit seulement pour number |
| `st_sessions` | id, user_id, activity_id, date, description (250), rating (0–5), created_at, updated_at | unique (user_id, activity_id, date) ; pas de date future (trigger, Europe/Paris) ; supprimée avec son activité |
| `st_session_values` | session_id, metric_id, value, sets, kg, reps | clé (session_id, metric_id) ; RLS via la séance parente ; supprimée avec sa séance ou son metric |

Unités de `value` : km (distance), secondes (durée), secondes/km (allure), km/h (vitesse), libre (nombre).
Le type `sets` utilise `sets`, `kg` et `reps`.

Fonctions (SECURITY INVOKER, donc soumises au RLS) :
- `st_ensure_defaults()` crée les activités et metrics de départ si l'utilisateur n'a aucune activité.
- `st_save_session(...)` crée ou modifie une séance et remplace ses valeurs en une transaction.

Le SQL a été appliqué avec `npx supabase db query --linked -f sql/001_sport_track.sql` (depuis le dossier
ideel-like, relié au projet), hors de l'historique de migrations de la CLI, qui appartient à ideel-like.
