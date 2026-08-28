import { NgModule } from '@angular/core';
import { NoPreloading, RouterModule, Routes } from '@angular/router';
import { AuthGuard } from './core/guards/auth.guard';
import { RoleGuard } from './core/guards/role.guard';

/**
 * Rutas raíz separadas por layout (admin y móvil) para mantener
 * desacoplada la experiencia por rol desde la base del MVP.
 */
const routes: Routes = [
  { path: 'auth', loadChildren: () => import('./modules/auth/auth.module').then((m) => m.AuthModule) },
  {
    path: 'admin',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['superadmin', 'admin', 'assistant', 'asistente'] },
    loadChildren: () => import('./layouts/admin-layout/admin-layout.module').then((m) => m.AdminLayoutModule),
  },
  {
    path: 'mobile',
    canActivate: [AuthGuard, RoleGuard],
    data: { roles: ['artist', 'artista', 'superadmin', 'admin', 'assistant', 'asistente'] },
    loadChildren: () => import('./layouts/mobile-layout/mobile-layout.module').then((m) => m.MobileLayoutModule),
  },
  { path: '', redirectTo: 'auth/login', pathMatch: 'full' },
  { path: '**', redirectTo: 'auth/login' },
];

@NgModule({ imports: [RouterModule.forRoot(routes, { preloadingStrategy: NoPreloading })], exports: [RouterModule] })
export class AppRoutingModule {}
