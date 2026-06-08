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
      bottom: calc(1.25rem + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      background: #172033;
      color: #fff;
      padding: 0.8rem 1rem;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      font-size: 0.875rem;
      font-weight: 650;
      z-index: 2000;
      box-shadow: 0 16px 40px rgba(10, 18, 32, 0.28);
      animation: toastIn 0.3s ease;
      max-width: 90vw;
      text-align: center;
    }
    @media (max-width: 640px) {
      .toast {
        bottom: calc(5.8rem + env(safe-area-inset-bottom));
        width: min(28rem, calc(100vw - 1.5rem));
      }
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
