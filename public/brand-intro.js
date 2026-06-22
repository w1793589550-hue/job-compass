const introStorageKey = "jobCompassBrandIntroPlayed";
const replayTargets = [...document.querySelectorAll("[data-brand-replay]")];
let activeIntro = null;

function introMarkup() {
  return `
    <div class="brand-intro" role="dialog" aria-label="职路品牌动画" aria-modal="true">
      <div class="brand-intro-stage">
        <div class="brand-intro-ambient" aria-hidden="true"></div>
        <svg class="brand-intro-lines" viewBox="0 0 1600 900" aria-hidden="true">
          <rect class="brand-intro-frame" x="112" y="82" width="1376" height="736" rx="78" pathLength="1"></rect>
          <path class="brand-intro-route" pathLength="1" d="M510 770 C620 680 690 622 782 560 C875 497 884 430 942 335"></path>
          <circle class="brand-intro-node" cx="942" cy="335" r="12"></circle>
        </svg>
        <div class="brand-intro-lockup">
          <div class="brand-intro-logo-shell">
            <img class="brand-intro-logo" src="/brand-logo-v2.png" alt="职路品牌标志" />
            <span class="brand-intro-scan" aria-hidden="true"></span>
            <span class="brand-intro-compass-glow" aria-hidden="true"></span>
          </div>
          <div class="brand-intro-copy">
            <span class="brand-intro-kicker">GRADUATE JOB COMPASS</span>
            <strong>职路</strong>
            <p>沿着证据，找到方向</p>
          </div>
        </div>
        <div class="brand-intro-progress" aria-hidden="true"><i></i></div>
        <button class="brand-intro-skip" type="button">跳过</button>
      </div>
    </div>
  `;
}

function removeIntro(intro) {
  if (activeIntro !== intro) return;
  activeIntro = null;
  intro.remove();
  document.body.classList.remove("brand-intro-active");
}

function fallbackAnimation(intro) {
  intro.classList.add("brand-intro-fallback");
  window.setTimeout(() => {
    intro.classList.add("is-leaving");
    window.setTimeout(() => removeIntro(intro), 420);
  }, 2200);
}

function playBrandIntro({ force = false } = {}) {
  if (activeIntro) return;
  if (!force && sessionStorage.getItem(introStorageKey) === "true") return;
  sessionStorage.setItem(introStorageKey, "true");

  document.body.insertAdjacentHTML("afterbegin", introMarkup());
  const intro = document.querySelector(".brand-intro");
  if (!intro) return;
  activeIntro = intro;
  document.body.classList.add("brand-intro-active");

  const skip = intro.querySelector(".brand-intro-skip");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let timeline;

  const dismiss = () => {
    if (!activeIntro) return;
    if (timeline) timeline.kill();
    if (!window.gsap || reducedMotion) {
      intro.classList.add("is-leaving");
      window.setTimeout(() => removeIntro(intro), 260);
      return;
    }
    window.gsap.to(intro, {
      autoAlpha: 0,
      scale: 1.012,
      duration: 0.42,
      ease: "power2.inOut",
      onComplete: () => removeIntro(intro),
    });
  };

  skip.addEventListener("click", dismiss);
  intro.addEventListener("keydown", (event) => {
    if (event.key === "Escape") dismiss();
  });
  skip.focus({ preventScroll: true });

  if (!window.gsap || reducedMotion) {
    fallbackAnimation(intro);
    return;
  }

  const gsap = window.gsap;
  gsap.set(intro, { autoAlpha: 1 });
  gsap.set(".brand-intro-frame", { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(".brand-intro-route", { strokeDasharray: 1, strokeDashoffset: 1 });
  gsap.set(".brand-intro-node", { scale: 0, transformOrigin: "50% 50%" });
  gsap.set(".brand-intro-logo-shell", { autoAlpha: 0, scale: 0.72, rotation: -3 });
  gsap.set(".brand-intro-logo", { clipPath: "inset(50% 50% 50% 50% round 22%)" });
  gsap.set(".brand-intro-copy > *", { autoAlpha: 0, y: 22 });
  gsap.set(".brand-intro-scan", { autoAlpha: 0, yPercent: -150 });
  gsap.set(".brand-intro-compass-glow", { autoAlpha: 0, scale: 0.35 });
  gsap.set(".brand-intro-progress i", { scaleX: 0, transformOrigin: "left center" });

  timeline = gsap.timeline({
    defaults: { ease: "power3.out" },
    onComplete: () => {
      gsap.delayedCall(0.48, dismiss);
    },
  });
  timeline
    .fromTo(".brand-intro-stage", { scale: 0.965 }, { scale: 1, duration: 0.7 }, 0)
    .to(".brand-intro-frame", { strokeDashoffset: 0, duration: 0.85, ease: "power2.inOut" }, 0.08)
    .to(".brand-intro-logo-shell", { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.72 }, 0.32)
    .to(".brand-intro-logo", { clipPath: "inset(0% 0% 0% 0% round 8%)", duration: 0.78, ease: "power4.inOut" }, 0.38)
    .to(".brand-intro-scan", { autoAlpha: 0.8, yPercent: 230, duration: 0.72, ease: "power1.inOut" }, 0.48)
    .to(".brand-intro-scan", { autoAlpha: 0, duration: 0.2 }, ">-0.2")
    .to(".brand-intro-route", { strokeDashoffset: 0, duration: 0.76, ease: "power2.inOut" }, 0.72)
    .to(".brand-intro-node", { scale: 1, duration: 0.28, ease: "back.out(2.2)" }, 1.25)
    .to(".brand-intro-compass-glow", { autoAlpha: 1, scale: 1, duration: 0.38, ease: "back.out(2)" }, 1.06)
    .to(".brand-intro-compass-glow", { autoAlpha: 0.22, scale: 1.75, duration: 0.55, ease: "power2.out" }, ">")
    .to(".brand-intro-copy > *", { autoAlpha: 1, y: 0, duration: 0.5, stagger: 0.09 }, 0.95)
    .to(".brand-intro-progress i", { scaleX: 1, duration: 1.9, ease: "none" }, 0.2);
}

for (const target of replayTargets) {
  target.addEventListener("click", () => playBrandIntro({ force: true }));
  target.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    playBrandIntro({ force: true });
  });
}

playBrandIntro();
