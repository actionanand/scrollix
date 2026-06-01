import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="not-found">
      <h1>404</h1>
      <p>Page not found</p>
      <a routerLink="/videos" class="home-link">← Back to Home</a>
    </div>
  `,
  styles: `
    .not-found {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 60vh;
      text-align: center;
      padding: 2rem;
    }
    h1 {
      font-size: 4rem;
      color: #4361ee;
      margin-bottom: 0.5rem;
    }
    p {
      font-size: 1.2rem;
      color: #666;
      margin-bottom: 2rem;
    }
    .home-link {
      padding: 0.75rem 1.5rem;
      background: #4361ee;
      color: #fff;
      border-radius: 8px;
      font-weight: 500;
      transition: background-color 0.2s;
      &:hover {
        background: #3a56d4;
      }
      &:focus-visible {
        outline: 2px solid #4361ee;
        outline-offset: 2px;
      }
    }
  `,
})
export class NotFoundComponent {}
