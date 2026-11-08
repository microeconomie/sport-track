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
« Exercices » (séries × kg × reps), préremplie (cases vides) avec les exercices liés à l'activité, ou à
défaut avec ceux de sa dernière séance. La liste « + Ajouter un exercice » sépare « Liés à cette
activité » et « Autres exercices ».
La durée se saisit en heures et minutes. Allure = durée / distance (arrondie à la seconde), vitesse =
distance / heures (1 décimale).

## Semaine : plusieurs séances par jour

Les séances d'un jour tiennent sur une seule ligne qui défile horizontalement (scroll-snap, barre masquée,
`overscroll-behavior-x: contain` pour ne pas changer de semaine). Trois cartes visibles au maximum,
fondu à droite à partir de la 4e. Chaque carte est un conteneur (`container-type: inline-size`) :
moins de 240 px, plus d'étoiles ; moins de 150 px, plus de sous-titre ni de ligne de détail ; moins de
112 px, icône au-dessus du nom (12 px, tronqué). Au plus 10 séances par jour : bouton + masqué, refus
à l'enregistrement et trigger en base. Une même activité reste limitée à une séance par jour.

## Mode intime

Interrupteur en bas de l'onglet Activités (`st_settings.intimate_mode`, activé par défaut). Activé : section
« Activités intimes » (15 icônes dédiées, mêmes nom / sous-titre / couleur), lien « Afficher / Masquer les
activités intimes » dans la fiche séance. Une séance intime n'a que la description et la sensation.
Désactivé : activités intimes et leurs séances masquées partout (semaine, compteurs, histogramme,
saisie), sans rien supprimer. Aucune activité intime de départ.

## Exercices liés à une activité

Un exercice peut être lié à une activité non intime et sans profil (`st_metrics.activity_id`). Son icône
est celle de l'activité liée sauf choix explicite (`st_metrics.icon`, null = héritée, fitness_center
sans activité), et sa tuile prend la couleur de l'activité. L'onglet Activités trie les exercices par
activité liée.

## Base de données

Tables du schéma `public`, toutes préfixées `st_`, RLS activée (`auth.uid() = user_id`, rôle
`authenticated` seulement, aucun droit pour `anon`). SQL : `sql/001_sport_track.sql` (création) puis
`sql/002_profiles.sql` (profils), puis `sql/003_v3.sql` (plusieurs séances par jour, mode intime,
exercices liés).

| Table | Colonnes | Notes |
|---|---|---|
| `st_activities` | id, user_id, name (40), subtitle (80, facultatif), icon (Material Symbols), color (c1…c12), intimate, position, created_at | l'icône détermine le profil ; une activité qui devient intime ou à profil perd ses exercices liés (trigger) |
| `st_metrics` | id, user_id, name (40), type, unit, profile, activity_id, icon, position, created_at | voir ci-dessous ; activity_id : même propriétaire, remis à null si l'activité est supprimée |
| `st_sessions` | id, user_id, activity_id, date, description (250), rating (0–5), created_at, updated_at | unique (user_id, activity_id, date) ; pas de date future et 10 par jour au plus (trigger `st_sessions_guard`, Europe/Paris) ; supprimée avec son activité |
| `st_settings` | user_id (clé), intimate_mode (défaut true), updated_at | créée par `st_ensure_defaults` |
| `st_session_values` | session_id, metric_id, value, sets, kg, reps | clé (session_id, metric_id) ; RLS via la séance parente ; supprimée avec sa séance ou son exercice |

`st_metrics` contient deux sortes de lignes :
- **Mesures intégrées** (`profile` = run, bike, swim ou hike) : une par couple profil / type, par exemple
  Course · Distance et Vélo · Distance sont distinctes. Ni modifiables ni supprimables (RLS).
  Types : distance, duration, pace, speed, number (longueurs, m D+ ; `unit` renseignée).
- **Exercices** (`profile` null) : toujours de type `sets`, créés, renommés et supprimés librement ; liés ou
  non à une activité (trigger `st_metrics_guard` : ni intime ni à profil).

Unités de `value` : km (distance), secondes (durée, multiple de 60 pour les saisies), secondes/km (allure),
km/h (vitesse), nombre (longueurs, mètres). Le type `sets` utilise `sets`, `kg` et `reps`.

Fonctions (SECURITY INVOKER, donc soumises au RLS) :
- `st_ensure_defaults()`, appelée à chaque démarrage : crée la ligne `st_settings` et les mesures intégrées
  manquantes et, au premier lancement, les activités de départ et l'exercice « Exercice biceps » (lié à
  Musculation · Bras / pecs).
- `st_save_session(...)` crée ou modifie une séance et remplace ses valeurs en une transaction (aucune
  valeur pour une activité intime).

Le SQL est appliqué dans une transaction avec `npx supabase db query --linked -f sql/<fichier>.sql`
(depuis le dossier ideel-like, relié au projet), hors de l'historique de migrations de la CLI, qui
appartient à ideel-like.
