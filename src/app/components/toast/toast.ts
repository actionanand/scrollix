import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (toast.visible()) {
      <div class="toast" role="status" aria-live="polite">{{ toast.message() }}</div>
    }
  `,
  styles: `
    .toast {
      position: fixed;
      bottom: 1.5rem;
      left: 50%;
      transform: translateX(-50%);
      background: #333;
      color: #fff;
      padding: 0.65rem 1.25rem;
      border-radius: 8px;
      font-size: 0.875rem;
      z-index: 2000;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
      animation: toastIn 0.3s ease;
      max-width: 90vw;
      text-align: center;
    }
    @keyframes toastIn {
      from {
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
    }
  `,
})
export class ToastComponent {
  protected readonly toast = inject(ToastService);
}
