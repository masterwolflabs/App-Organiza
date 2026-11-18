# Master Planner para iPhone (Capacitor)

La app abre `https://app-organiza-six.vercel.app` (ver `capacitor.config.json`) y suma lo que la web no puede:
avisos programados en el teléfono (LocalNotifications) y **Apple Salud** (`@capgo/capacitor-health`, solo lectura).

## Activar Apple Salud (una vez, en el Mac de Emanuel, con Xcode)

1. `cd ios-app && npm install`
2. Si aún no existe la carpeta `ios/`: `npx cap add ios`. Si ya existe: `npx cap sync ios`.
3. `npx cap open ios` → en Xcode, target **App** → *Signing & Capabilities* → **+ Capability** → **HealthKit**.
4. En `ios/App/App/Info.plist` agregar:
   - `NSHealthShareUsageDescription` = «Master Planner lee tus pasos, distancia y entrenamientos para cuidar tu recuperación en Workout Pro.»
   - `NSHealthUpdateUsageDescription` = «Master Planner no escribe en Salud.» (Apple lo pide igual)
5. Compilar en el iPhone (cuenta de Apple Developer). En Workout Pro → 🔋 Cómo llegas hoy → **Traer de Apple Salud** → aceptar permisos.

Qué lee: pasos y distancia por día y entrenamientos (bici, caminata, correr, cerro, natación, deportes). Los de fuerza
se omiten (ya están en Workout Pro). Si no hay Apple Watch o no hay datos, simplemente no llega nada.
Si se negó el permiso: iPhone → Salud → perfil → Apps → Master Planner.
