# Supreme Empire Complete Server

## Render
Build Command: `npm install`
Start Command: `npm start`

## Included
- 4 banks
- 14 factions
- scheduled events
- vehicle catalog
- character skins
- properties and businesses
- pets
- shops
- missions configuration
- faction war zones
- 5 characters per account
- globally unique nicknames
- complete character data: level, XP, money, SE Coins, health, armor, hunger/food, vehicles, inventory, banks, properties, businesses, pets, jobs, missions, faction/rank, position, statistics and event history
- JSON persistence and activity logging
- CORS for Godot/mobile clients

## Main endpoints
GET `/`
GET `/health`
GET `/api/status`
GET `/api/config`
GET `/api/players`
POST `/api/account`
GET `/api/account/:accountId`
POST `/api/account/:accountId/login`
POST `/api/account/:accountId/logout`
GET `/api/account/:accountId/characters`
POST `/api/account/:accountId/characters`
GET `/api/account/:accountId/characters/:characterId`
GET `/api/account/:accountId/characters/:characterId/data`
POST `/api/account/:accountId/characters/:characterId/select`
POST or PUT `/api/account/:accountId/characters/:characterId/save`
POST `/api/account/:accountId/characters/:characterId/position`

## Important
This is a complete functional server foundation and configuration package. JSON files are included so the project has no empty configuration placeholders. For production-scale online multiplayer, persistent database storage and stronger authentication/authoritative networking should be added.
