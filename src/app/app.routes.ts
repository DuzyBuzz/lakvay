import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./features/discovery/discovery-page/discovery-page').then(
        (page) => page.DiscoveryPage,
      ),
  },
  { path: '**', redirectTo: '' },
];
