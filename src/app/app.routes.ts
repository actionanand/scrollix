import { Routes } from '@angular/router';

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
];
