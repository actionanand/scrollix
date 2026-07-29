import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'videos', pathMatch: 'full' },
  {
    path: 'videos',
    loadComponent: () =>
      import('./components/video-list/video-list').then((m) => m.VideoListComponent),
  },
  {
    path: 'posts',
    loadComponent: () =>
      import('./components/post-list/post-list').then((m) => m.PostListComponent),
  },
  {
    path: 'support',
    loadComponent: () => import('./components/support/support').then((m) => m.SupportComponent),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./components/settings/settings').then((m) => m.SettingsComponent),
  },
  {
    path: 'video/:id',
    loadComponent: () =>
      import('./components/video-detail/video-detail').then((m) => m.VideoDetailComponent),
  },
  {
    path: '**',
    loadComponent: () =>
      import('./components/not-found/not-found').then((m) => m.NotFoundComponent),
  },
];
