export default function Landing({ configured }: { configured: boolean }) {
  return <main className="landing-shell">
    <header className="landing-nav"><div className="brand landing-brand"><span className="brand-mark">澄</span><div><b>肌膚日誌</b><small>SKIN NOTES</small></div></div><a href="/auth/google" className="google-button compact"><span>G</span>使用 Google 登入</a></header>
    <section className="landing-hero">
      <div className="landing-copy"><span className="eyebrow">PRIVATE SKIN JOURNAL</span><h1>找到真正適合你的<br/>保養方法</h1><p>用一致的每日照片、膚況量表與左右臉實驗，將感覺變成看得見的長期趨勢。</p><a href="/auth/google" className="google-button"><span>G</span>使用 Google 帳號開始</a>{!configured && <div className="setup-notice">Google 登入服務正在等待管理員完成連線設定。</div>}<small className="login-privacy">我們不會取得或儲存你的 Gmail 密碼。每個帳號的照片與紀錄完全分開。</small></div>
      <div className="landing-visual"><div className="visual-card back"><span>7 月</span><b>連續記錄 12 天</b></div><div className="visual-card front"><span className="eyebrow">本週膚況</span><div className="visual-score"><b>2.1</b><small>/ 5</small></div><div className="visual-bars">{[70,62,66,48,43,38,32].map((h,i)=><i key={i} style={{height:`${h}%`}}/>)}</div><p>相較實驗開始改善 <b>21%</b></p></div><div className="visual-lock">私人<br/>保存</div></div>
    </section>
    <section className="landing-features"><article><span>01</span><h2>每天三個角度</h2><p>固定正面、左側與右側，降低光線及角度造成的判斷誤差。</p></article><article><span>02</span><h2>每個帳號獨立</h2><p>登入身分由 Google 驗證，所有查詢都由伺服器強制隔離。</p></article><article><span>03</span><h2>日曆回顧變化</h2><p>依日期查看照片、膚況分數、當日保養與可能的生活干擾。</p></article></section>
    <footer className="landing-footer">肌膚日誌是個人觀察工具，不提供醫療診斷。</footer>
  </main>;
}
