# 🎄 Carte de Noël animée

Un site pour créer et envoyer des cartes de vœux de Noël animées à ses proches.

- **Création** : destinataire, message, signature, **photo facultative** (façon Polaroïd), 4 ambiances
  (Nuit étoilée, Rouge velours, Forêt enneigée, Givre) et 5 illustrations animées. Un aperçu en 3D se met à jour en direct.
- **4 cinématiques au choix** (bouton « Passer » disponible) :
  - *Clair de lune* : bandes cinéma, travelling vers les montagnes sous la pleine lune, traîneau devant la lune, comète ;
  - *Hyperespace* : saut dans les étoiles, nébuleuse, galaxie de particules dorées qui forme le prénom, implosion lumineuse ;
  - *Aurore boréale* : la caméra se lève d'un lac gelé vers des aurores dansantes, des lucioles écrivent le prénom ;
  - *Boule à neige* : la boule est secouée, le village s'illumine, le prénom se grave sur la plaque, puis plongée dans la boule.
- **Ouverture** : on brise le sceau de cire, la lettre sort de l'enveloppe, la carte s'ouvre comme un livre,
  la photo se « développe », le message s'écrit à la machine, puis un feu d'artifice éclate.
  Une boîte à musique accompagne le tout (bouton pour couper le son).
- **Tableau de bord privé** (`admin.html`) : visiteurs uniques, visites par jour, cartes créées (avec message et photo),
  nombre d'ouvertures de chaque carte, appareils, provenance et activité récente.

Le site est statique (`index.html`, `style.css`, `app.js`). Les cartes, photos et statistiques sont stockées
dans [Supabase](https://supabase.com) (offre gratuite). Sans Supabase, le site fonctionne quand même, mais sans photo
ni statistiques : le message est alors stocké dans le lien.

## Brancher Supabase (≈ 10 minutes)

1. **Crée un projet** : sur <https://supabase.com>, crée un compte, puis *New project*.
   Choisis un nom (ex. `noel`) et la région *West EU (Paris)*.
2. **Crée la base** : dans le projet, ouvre **SQL Editor → New query**, colle tout le contenu de
   [`supabase/schema.sql`](supabase/schema.sql) et clique sur **Run**.
3. **Crée ton compte administrateur** :
   - **Authentication → Users → Add user → Create new user** : ton e-mail et un mot de passe solide,
     coche *Auto Confirm User*.
   - Retourne dans **SQL Editor** et lance (avec ton e-mail) :
     ```sql
     insert into public.admins (user_id)
     select id from auth.users where email = 'ton-email@exemple.com';
     ```
   - Recommandé : **Authentication → Sign In / Providers → Email**, désactive *Allow new users to sign up*.
4. **Relie le site** : dans **Project Settings → API**, copie la *Project URL* et la clé *anon public*
   (ou *publishable*), puis colle-les dans [`config.js`](config.js).
   Cette clé est faite pour être publique : ce sont les règles de la base qui protègent les données.

Le tableau de bord sera ensuite à l'adresse `https://<ton-pseudo>.github.io/noel/admin.html`.

### Ce qui est protégé

- Le site public peut seulement **créer** une carte, **lire une carte précise** grâce à son lien (identifiant aléatoire)
  et **enregistrer une visite**. Il ne peut pas lister les cartes ni lire les statistiques.
- Seuls les comptes listés dans la table `admins` voient les cartes et les statistiques.
- Les photos sont publiques pour qui a leur lien (nom aléatoire), limitées à 3 Mo et au format JPEG.
- Les ouvertures faites depuis le navigateur qui a créé une carte ne sont pas comptées.

## Tester en local

```bash
python3 -m http.server 8000
```

Puis ouvrir <http://localhost:8000>.

## Mise en ligne (GitHub Pages)

**Settings → Pages → Deploy from a branch** : choisir `main` et `/ (root)`, puis **Save**.
