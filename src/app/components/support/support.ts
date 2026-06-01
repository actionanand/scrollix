import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { Router } from '@angular/router';

@Component({
  selector: 'app-support',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './support.html',
  styleUrl: './support.scss',
})
export class SupportComponent {
  private readonly router = inject(Router);

  protected goBack(): void {
    this.router.navigate(['/videos']);
  }
}
