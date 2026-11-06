# Lakvay

This project was generated using [Angular CLI](https://github.com/angular/angular-cli) version 22.2.3.

## Development server

To start a local development server, run:

```bash
ng serve
```

Once the server is running, open your browser and navigate to `http://localhost:4200/`. The application will automatically reload whenever you modify any of the source files.

## Code scaffolding

Angular CLI includes powerful code scaffolding tools. To generate a new component, run:

```bash
ng generate component component-name
```

For a complete list of available schematics (such as `components`, `directives`, or `pipes`), run:

```bash
ng generate --help
```

## Building

To build the project run:

```bash
ng build
```

This will compile your project and store the build artifacts in the `dist/` directory. By default, the production build optimizes your application for performance and speed.

## Running unit tests

To execute unit tests with the [Vitest](https://vitest.dev/) test runner, use the following command:

```bash
ng test
```

## Running end-to-end tests

For end-to-end (e2e) testing, run:

```bash
ng e2e
```

Angular CLI does not come with an end-to-end testing framework by default. You can choose one that suits your needs.

## Additional Resources

For more information on using the Angular CLI, including detailed command references, visit the [Angular CLI Overview and Command Reference](https://angular.dev/tools/cli) page.

## Lakvay discovery UI

The interface uses Tailwind CSS and includes home discovery, a map and place list, messages, saved places, business profiles, and post creation. Generate new standalone features with Angular CLI, for example:

```bash
ng generate component features/example/example-page
```

## Firebase setup

Firebase Authentication, Firestore, and Storage use the modular Firebase SDK. The browser app reads Firebase Web App settings from `src/environments/environment.ts`. Replace those public client settings with the Web App configuration from your Firebase project when connecting a different project. Never put service-account credentials or Admin SDK keys in the browser app.

1. Create a Firebase project and register a Web App. Copy its web configuration into `src/environments/environment.ts` if you are not using the project already configured there.
2. In Firebase Console, enable Google, Email/Password, and Phone under Authentication > Sign-in method. Add the local and production app domains to Authorized domains. Phone sign-in uses reCAPTCHA and may incur SMS quotas or billing.
3. Create the Firestore database and Storage bucket for the project.
4. Install/use the Firebase CLI, select your project with `firebase use <your-project-id>`, build the Angular app, then deploy the checked-in Firestore rules, index, Storage rules, and Hosting site:

   ```bash
   ng build
   firebase deploy --only firestore:rules,firestore:indexes,storage,hosting
   ```

Consumers can browse the public map and search published places without signing in. Opening a place profile requires a consumer account. Merchants use a separate merchant account and submit a business name, category, address, coordinates, and optional details from the business dashboard. Merchant submissions are published immediately after the required location and data validation, and owners can edit their own listings. Published businesses with valid `latitude` and `longitude` are displayed as interactive OpenStreetMap markers; selecting a marker opens the business profile.

Public post creation requires a signed-in user. User profiles and `users/{uid}/savedBusinesses/{businessId}` are private to the authenticated user. Media uploads are restricted by Storage rules to the authenticated user's own post path and the file type/size limits enforced by the client.

The `firestore.indexes.json` file includes the public feed query's composite index. Firestore and Storage rules deny unspecified access by default. Messaging, likes/comments, and reviews are deferred from the MVP; merchant listing management is limited to the owning merchant account.

## Brand assets

The supplied images are stored in `src/assets` and copied to `/assets` by the Angular build. The Lakvay logo and wordmark are used in the desktop navigation and mobile header; the footer banner is shown below the home discovery feed; the mobile and desktop authentication artwork is used in the sign-in dialog. The logo is also used as the browser favicon.
"# lakvay" 
