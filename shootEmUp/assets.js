const assets = {
  ready: false,
  images: {
    player: { img: new Image(), loaded: false, src: 'assets/player.png' },
    enemy: { img: new Image(), loaded: false, src: 'assets/enemy.png' },
    rusher: { img: new Image(), loaded: false, src: 'assets/rusher.png' },
    elite: { img: new Image(), loaded: false, src: 'assets/elite.png' },
  },
};

function loadAssets() {
  const list = Object.values(assets.images);
  let remaining = list.length;
  for (let i = 0; i < list.length; i++) {
    const entry = list[i];
    entry.img.onload = () => {
      entry.loaded = true;
      remaining--;
      if (remaining === 0) assets.ready = true;
    };
    entry.img.onerror = () => {
      entry.loaded = false;
      remaining--;
      if (remaining === 0) assets.ready = true;
    };
    entry.img.src = entry.src;
  }
}
