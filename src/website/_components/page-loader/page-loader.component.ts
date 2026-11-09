import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'website-page-loader',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="loader-backdrop" [class.fade-out]="isExiting()">
      <div class="loader-container">

        <!-- Brand Stack -->
        <div class="brand-stack">
          <div class="logo-mark">
            <span class="chevron left"></span>
            <span class="chevron right"></span>
          </div>
          <h2 class="brand-name">NAVRIK</h2>
          <p class="brand-tagline">TRAYS, CANOPIES & ACCESSORIES</p>
        </div>

        <!-- Industrial Loading Bar -->
        <div class="industrial-loader">
          <div class="loader-track">
            <div class="loader-fill"></div>
          </div>
          <div class="status-box">
             <p class="status-indicator">PREMIUM ALUMINIUM</p>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host {
      --nv-black: var(--nv-surface);
      --nv-grey-dark: var(--nv-surface-raised);
      --nv-grey-light: var(--nv-text-muted);
      --nv-silver: var(--nv-text-main);
    }

    /* --- TOUGH DARK BACKGROUND --- */
    .loader-backdrop {
      position: fixed;
      inset: 0;
      z-index: 99999;
      /* Deep radial gradient to simulate a spotlight on dark textured metal */
      background: radial-gradient(circle at center, var(--nv-grey-dark) 0%, var(--nv-black) 80%);

      display: flex;
      align-items: center;
      justify-content: center;

      /* Never block scroll or touch events on the page behind the loader */
      pointer-events: none;

      transition: opacity 0.6s ease-in-out, visibility 0.6s;
      opacity: 1;
      visibility: visible;
    }

    .loader-backdrop.fade-out {
      opacity: 0;
      visibility: hidden;
    }

    .loader-container {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2.5rem;
      max-width: 100%;
      padding: 1rem;
      text-align: center;
    }

    /* --- BRAND TYPOGRAPHY & METALLIC EFFECT --- */
    .brand-stack {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 5px;
    }

    .brand-name {
      margin: 0;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 3.5rem;
      font-weight: 900;
      letter-spacing: 0.05em;
      text-transform: uppercase;

      color: var(--nv-text-main);
    }

    .brand-tagline {
      margin: 0;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: clamp(.65rem, 3vw, .9rem);
      font-weight: 600;
      letter-spacing: 0.3em;
      color: var(--nv-silver);
      text-transform: uppercase;
    }

    /* --- HEAVY DUTY LOADER BAR --- */
    .industrial-loader {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 15px;
      width: 100%;
      max-width: 300px;
    }

    .loader-track {
      width: 100%;
      height: 8px;
      background-color: var(--nv-surface);
      border: 1px solid var(--nv-border);
      border-radius: var(--ui-radius);
      overflow: hidden;
      position: relative;
      /* Sharp, angled ends for that mechanical/truck feel */
      transform: skewX(-15deg);
      box-shadow: inset 0 2px 4px rgba(0,0,0,0.9);
    }

    .loader-fill {
      position: absolute;
      top: 0;
      left: 0;
      transform: translateX(-100%);
      height: 100%;
      width: 50%;
      background: linear-gradient(90deg, transparent, var(--nv-orange), var(--nv-orange));
      /* Sweeping engine-rev animation */
      animation: revEngine 1.5s cubic-bezier(0.77, 0, 0.175, 1) infinite;
    }

    @keyframes revEngine {
      0% { transform: translateX(-100%); }
      50% { transform: translateX(200%); }
      100% { transform: translateX(200%); }
    }

    /* --- STATUS INDICATOR --- */
    .status-box {
      text-align: center;
      /* Mimicking the orange highlight strip from the flyer */
      background: linear-gradient(90deg, transparent, color-mix(in srgb, var(--nv-orange) 10%, transparent), transparent);
      padding: 4px 20px;
    }

    .status-indicator {
      margin: 0;
      font-family: 'Inter', -apple-system, sans-serif;
      font-size: 0.85rem;
      letter-spacing: 0.1em;
      color: var(--nv-accent-readable);
      font-weight: 800;
      text-transform: uppercase;

      animation: pulseText 2s infinite ease-in-out;
    }

    @keyframes pulseText {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; filter: brightness(1.2); }
    }
    @media (prefers-reduced-motion: reduce) {
      .loader-backdrop { transition-duration: 0.01ms; }
      .loader-fill, .status-indicator { animation: none; }
      .loader-fill { transform: translateX(50%); }
    }
  `]
})
export class PageLoaderComponent implements OnInit {
  isExiting = signal(false);

  ngOnInit() {
    /** * Controlled by the WebsiteComponent wrapper.
     */
  }

  // Triggered right before toggle to allow the fade out animation to play
  public triggerExit() {
    this.isExiting.set(true);
  }
}
