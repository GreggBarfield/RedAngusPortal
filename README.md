# Red Angus Portal

Red Angus-only cattle marketing and search portal. Same stack as CattleCoin:
Express 5 API (BackEnd), React 19 + TypeScript + Vite + Tailwind v4 + shadcn/ui (FrontEnd), PostgreSQL + PostGIS.

- Desktop folder: F:\raaaa
- Server folder: C:\raaaa
- Live address: https://redangus.blocktrustnetwork.com
- API port: 4200 (pm2 app name: raaaa-api)
- Database: raaaa (role raaaa_app)

## Run locally

    cd BackEnd
    npm install
    npm test
    npm start

    cd ../FrontEnd
    npm install
    npm test
    npm run dev

Front end dev address: http://localhost:5174 (proxies /api to http://localhost:4200).

## Rules
- Never commit .env or any secret.
- Built files (dist) never go in the source tree on the server.
- Check login on every route that changes data or shows private data.
