# Site Watcher

Crée le nouveau projet dédié à partir de l’archive GSM-OandM-Task-Management-main.zip et des captures d'écran jointes (GSM O&M Network Operations : Dashboard Shift at a glance, Work orders, Network sites, Field team, et fiche Task detail).

Commence par implémenter la vue cartographique interactive des sites télécoms avec leur statut en direct :
- Carte interactive des sites avec pastilles d'état (vert/normal, orange/maintenance, rouge/alarme ou panne critique) permettant aux coordinateurs du dispatch de localiser instantanément les pannes et d'assigner le technicien le plus proche.
- Intégrer également le suivi des SLA avec compte à rebours selon la criticité de l'incident (critique, haut, moyen) et alertes d'escalade.
- Préparer la fiche d'intervention terrain & check-list mobile pour les interventions (notamment GPM - generator preventive maintenance) avec relevés compteur horaire, niveau de carburant, tension batterie et photos.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/a54dae65-fab5-4063-a958-c5cd2c811800).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
