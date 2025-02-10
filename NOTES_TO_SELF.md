Alles wordt gebundeld door `rollup`. Die verzamelt alle losse `*.js` en `*.css`-bestanden, samen met de Node-modules in één bestand. Dat bestand wordt in `dist` geplaatst. 

Het bestand `rollup.config.js` bepaalt hoe het rollup-proces eruit ziet, er zijn een aantal rollup-plugins (zoals het includen van node-dependencies etc.) die daarbij draaien.

In `package.json` staat welke node dependencies er allemaal zijn (zowel dev als in productie). Elke keer als een aanpassing is gedaan aan één van de source-files, moet het commando `npm run build` uitgevoerd worden. Die runt intern vervolgens het commando dat in `script > build` in `package.json` staat. Vervolgens kan het gecommit en gepusht worden, en via HACS geüpdatet.