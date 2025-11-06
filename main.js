(() => {
  const cadenceEl = document.getElementById('cadence');
  const stateEl = document.getElementById('state');
  const reqBtn = document.getElementById('reqPermission');
  const simBtn = document.getElementById('simulateStep');
  const resetBtn = document.getElementById('reset');
  const ctx = document.getElementById('chart').getContext('2d');

  // 設定: ケイデンスしきい値（歩/分）
  const THRESHOLD_STATIONARY = 20; // 未満は静止
  const THRESHOLD_FAST = 110; // これ以上は早歩き

  // 歩検出パラメータ
  let lastStepTs = 0;
  const MIN_STEP_INTERVAL = 250; // ms （上限の歩速 ~240 spm）
  const PEAK_THRESHOLD = 1.0; // 加速度ピーク閾値 (m/s^2)
  const windowSeconds = 5; // スライディングウィンドウで計測

  // 状態保管
  let stepTimestamps = []; // ms 単位
  let gravity = { x: 0, y: 0, z: 0 }; // ローパスで重力推定
  const alpha = 0.8; // ローパス係数

  // チャート用履歴
  const historyLength = 60; // プロット点数 (時間解像度 ~0.5s)
  let cadenceHistory = Array(historyLength).fill(null);
  let times = Array.from({ length: historyLength }, (_, i) => i - historyLength + 1);

  const chart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: times,
      datasets: [{
        label: 'ケイデンス (歩/分)',
        data: cadenceHistory,
        borderColor: '#007bff',
        backgroundColor: 'rgba(0,123,255,0.1)',
        spanGaps: true
      }]
    },
    options: {
      animation: false,
      scales: { x: { display: false }, y: { suggestedMin: 0, suggestedMax: 160 } }
    }
  });

  function classify(cadence) {
    if (cadence < THRESHOLD_STATIONARY) return { label: '静止', color: '#666' };
    if (cadence >= THRESHOLD_FAST) return { label: '早歩き', color: '#d9534f' };
    return { label: '歩行', color: '#5cb85c' };
  }

  function updateUI(cadence) {
    cadenceEl.textContent = cadence === null ? '--' : Math.round(cadence);
    const st = cadence === null ? { label: '初期化中', color: '#888' } : classify(cadence);
    stateEl.textContent = st.label;
    stateEl.style.background = st.color;
  }

  function computeCadence() {
    const now = Date.now();
    const windowStart = now - windowSeconds * 1000;
    // 削除古いステップ
    stepTimestamps = stepTimestamps.filter(ts => ts >= windowStart);
    const count = stepTimestamps.length;
    if (count === 0) return 0;
    // cadence = steps per minute over the window
    const cadence = (count / windowSeconds) * 60;
    return cadence;
  }

  function pushHistory(cadence) {
    cadenceHistory.push(cadence);
    if (cadenceHistory.length > historyLength) cadenceHistory.shift();
    chart.data.datasets[0].data = cadenceHistory;
    chart.update('none');
  }

  function onStep(ts) {
    // 最小間隔チェック
    if (ts - lastStepTs < MIN_STEP_INTERVAL) return;
    lastStepTs = ts;
    stepTimestamps.push(ts);
  }

  // ステップ検出: DeviceMotion イベントの加速度からピーク検出
  let lastFiltered = 0;
  let lastPeakTime = 0;
  function handleMotion(ev) {
    // accelerationIncludingGravity を使い、ローパスで重力を推定して差分を取る
    const a = ev.accelerationIncludingGravity;
    if (!a) return;
    gravity.x = alpha * gravity.x + (1 - alpha) * a.x;
    gravity.y = alpha * gravity.y + (1 - alpha) * a.y;
    gravity.z = alpha * gravity.z + (1 - alpha) * a.z;
    const ax = a.x - gravity.x;
    const ay = a.y - gravity.y;
    const az = a.z - gravity.z;
    const mag = Math.sqrt(ax*ax + ay*ay + az*az);

    // 単純ピーク検出: 閾値越えで上昇 -> ピーク
    const now = Date.now();
    // 上昇から下降への移行でピークと判定
    if (lastFiltered > PEAK_THRESHOLD && mag <= lastFiltered && (now - lastPeakTime) > MIN_STEP_INTERVAL) {
      // ピーク検知
      lastPeakTime = now;
      onStep(now);
    }
    lastFiltered = mag;
  }

  // デバイスモーションの登録（iOS対応）
  async function enableMotion() {
    if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          alert('モーション許可が必要です。設定で許可してください。');
          return;
        }
      } catch (e) {
        console.warn('permission request failed', e);
        return;
      }
    }
    window.addEventListener('devicemotion', handleMotion);
    reqBtn.disabled = true;
  }

  // シミュレーション用: 人為的にステップを追加
  function simulateStep() {
    onStep(Date.now());
  }

  // リセット
  function resetAll() {
    stepTimestamps = [];
    cadenceHistory = Array(historyLength).fill(null);
    chart.data.datasets[0].data = cadenceHistory;
    chart.update();
    updateUI(null);
  }

  reqBtn.addEventListener('click', enableMotion);
  simBtn.addEventListener('click', simulateStep);
  resetBtn.addEventListener('click', resetAll);

  // 定期更新: ケイデンス計算 + UI更新
  setInterval(() => {
    const cadence = computeCadence();
    updateUI(cadence);
    pushHistory(cadence);
  }, 500);

  // 初期UI
  updateUI(null);

  // 開発時: コンソールでステップを発生させるショートカット
  window.__simulateStep = simulateStep;
})();
