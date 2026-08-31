import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

const starterUsers = [
  { id: 1, nickname: '林默', handle: 'linmo', avatar: '林', level: '进阶', wins: 18, games: 25 },
  { id: 2, nickname: '周予安', handle: 'yuan', avatar: '周', level: '高手', wins: 15, games: 22 },
  { id: 3, nickname: '沈清禾', handle: 'qinghe', avatar: '沈', level: '进阶', wins: 12, games: 19 },
  { id: 4, nickname: '陈放', handle: 'chenfang', avatar: '陈', level: '入门', wins: 9, games: 18 },
]

const starterMatches = [
  { id: 1, date: '2026-08-24', court: '东区 03 号场', winner: 1, loser: 2, winnerScore: 21, loserScore: 17 },
  { id: 2, date: '2026-08-22', court: '东区 01 号场', winner: 3, loser: 4, winnerScore: 21, loserScore: 14 },
  { id: 3, date: '2026-08-20', court: '中央球馆', winner: 2, loser: 4, winnerScore: 21, loserScore: 12 },
]

const getPrimaryUser = (users) => users[0] ?? starterUsers[0]

const normalizeUser = (user) => ({
  id: user.id,
  nickname: user.nickname ?? '新球友',
  handle: user.handle ?? (user.nickname ?? 'new-user').toLowerCase().replace(/\s+/g, ''),
  avatar: user.avatar ?? (user.nickname ?? '新').slice(0, 1),
  level: user.level ?? '入门',
  wins: Number(user.wins ?? 0),
  games: Number(user.games ?? 0),
  passwordHash: user.password_hash ?? user.passwordHash ?? '',
})

const normalizeMatch = (match) => ({
  id: match.id,
  date: match.date ?? new Date().toISOString().slice(0, 10),
  court: match.court ?? '未填写场地',
  winner: Number(match.winner),
  loser: Number(match.loser),
  winnerScore: Number(match.winner_score ?? match.winnerScore ?? 0),
  loserScore: Number(match.loser_score ?? match.loserScore ?? 0),
})

async function loadSupabaseData(setUsers, setMatches, setLoading, setCurrentUser) {
  try {
    setLoading(true)

    const [{ data: playersData, error: playersError }, { data: matchesData, error: matchesError }] = await Promise.all([
      supabase.from('players').select('*').order('id', { ascending: true }),
      supabase.from('matches').select('*').order('id', { ascending: false }),
    ])

    if (playersError || matchesError) {
      throw playersError ?? matchesError
    }

    const nextUsers = (playersData ?? []).map(normalizeUser)
    const nextMatches = (matchesData ?? []).map(normalizeMatch)

    if (nextUsers.length === 0 && nextMatches.length === 0) {
      const { error: insertUsersError } = await supabase.from('players').insert(
        starterUsers.map((user) => ({
          nickname: user.nickname,
          handle: user.handle,
          avatar: user.avatar,
          level: user.level,
          wins: user.wins,
          games: user.games,
          password_hash: '',
        }))
      )

      const { error: insertMatchesError } = await supabase.from('matches').insert(
        starterMatches.map((match) => ({
          date: match.date,
          court: match.court,
          winner: match.winner,
          loser: match.loser,
          winner_score: match.winnerScore,
          loser_score: match.loserScore,
        }))
      )

      if (insertUsersError || insertMatchesError) {
        throw insertUsersError ?? insertMatchesError
      }

      setUsers(starterUsers)
      setMatches(starterMatches)
      setCurrentUser(starterUsers[0])
      return
    }

    setUsers(nextUsers)
    setMatches(nextMatches)
    setCurrentUser((current) => {
      if (current && nextUsers.some((user) => user.id === current.id)) {
        return current
      }
      return nextUsers[0] ?? starterUsers[0]
    })
  } catch (error) {
    console.error('Failed to load data from Supabase:', error)
    setUsers(starterUsers)
    setMatches(starterMatches)
    setCurrentUser(starterUsers[0])
  } finally {
    setLoading(false)
  }
}

function App() {
  const [users, setUsers] = useState(starterUsers)
  const [matches, setMatches] = useState(starterMatches)
  const [page, setPage] = useState('overview')
  const [authOpen, setAuthOpen] = useState(false)
  const [authMode, setAuthMode] = useState('login')
  const [toast, setToast] = useState('')
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState(starterUsers[0])

  useEffect(() => {
    loadSupabaseData(setUsers, setMatches, setLoading, setCurrentUser)
  }, [])

  const leaderboard = useMemo(() => [...users].sort((a, b) => b.wins - a.wins), [users])

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const addMatch = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const winner = Number(form.get('winner'))
    const loser = Number(form.get('loser'))
    const winnerScore = Number(form.get('winnerScore'))
    const loserScore = Number(form.get('loserScore'))

    if (winner === loser) return showToast('请选择两位不同的选手')
    if (winnerScore <= loserScore) return showToast('胜者比分需要高于对手')

    const payload = {
      date: new Date().toISOString().slice(0, 10),
      court: form.get('court') || '未填写场地',
      winner,
      loser,
      winner_score: winnerScore,
      loser_score: loserScore,
    }

    try {
      const { data, error } = await supabase.from('matches').insert([payload]).select()
      if (error) throw error

      const matchRow = normalizeMatch(data?.[0] ?? payload)
      const updatedUsers = users.map((user) => {
        if (user.id === winner) return { ...user, wins: user.wins + 1, games: user.games + 1 }
        if (user.id === loser) return { ...user, games: user.games + 1 }
        return user
      })

      const { error: playersError } = await supabase.from('players').upsert(
        updatedUsers.map((user) => ({
          id: user.id,
          nickname: user.nickname,
          handle: user.handle,
          avatar: user.avatar,
          level: user.level,
          wins: user.wins,
          games: user.games,
        }))
      )

      if (playersError) throw playersError

      setMatches((prev) => [matchRow, ...prev])
      setUsers(updatedUsers)
      event.currentTarget.reset()
      setPage('overview')
      showToast('比赛已记录，排行榜已更新')
    } catch (error) {
      console.error('Failed to save match:', error)
      showToast('保存失败，请检查 Supabase 表配置')
    }
  }

  const register = async (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nickname = String(form.get('nickname') || '').trim()
    const password = String(form.get('password') || '')

    if (!nickname || password.length < 6) {
      showToast('昵称和密码不能为空，且密码至少 6 位')
      return
    }

    try {
      const bytes = new TextEncoder().encode(password)
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      const passwordHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')

      const payload = {
        nickname,
        handle: nickname.toLowerCase().replace(/\s+/g, ''),
        avatar: nickname.slice(0, 1),
        level: '入门',
        wins: 0,
        games: 0,
        password_hash: passwordHash,
      }

      const { data, error } = await supabase.from('players').insert([payload]).select()
      if (error) throw error

      const newUser = normalizeUser(data?.[0] ?? payload)
      setUsers((prev) => [newUser, ...prev])
      setCurrentUser(newUser)
      setAuthOpen(false)
      showToast(`欢迎加入，${nickname}`)
    } catch (error) {
      console.error('Failed to register user:', error)
      showToast('注册失败，请先在 Supabase 中创建 players 表')
    }
  }

  const initials = (id) => users.find((user) => user.id === id)?.avatar || '?'
  const nameOf = (id) => users.find((user) => user.id === id)?.nickname || '未知选手'
  const pageName = page === 'overview' ? '概览' : page === 'record' ? '记录比赛' : page === 'players' ? '用户库' : '排行榜'
  const currentProfile = currentUser ?? getPrimaryUser(users)

  return (
    <div className="app-shell">
      {loading && <div className="loading-mask">正在从 Supabase 同步数据...</div>}
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">↗</span><span>SMASH<br /><b>TRACK</b></span></div>
        <p className="eyebrow">我的运动空间</p>
        <nav>{[['overview', '⌂', '概览'], ['record', '＋', '记录比赛'], ['players', '♧', '用户库'], ['ranking', '↗', '排行榜']].map(([key, icon, label]) => (
          <button key={key} className={page === key ? 'nav-item active' : 'nav-item'} onClick={() => setPage(key)}><span>{icon}</span>{label}</button>
        ))}</nav>
        <div className="sidebar-foot"><div className="mini-court"><i /><i /><i /><i /></div><p>每一分都值得<br /><strong>被记录。</strong></p></div>
      </aside>

      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">SMASH TRACK <b>/</b> {pageName}</span>
            <h1>{page === 'overview' ? `早上好，${currentProfile.nickname}` : page === 'record' ? '记录一场新比赛' : page === 'players' ? '球友档案' : '赛季排行榜'}</h1>
          </div>
          <div className="top-actions">
            <button className="icon-button" aria-label="通知">♧<span /></button>
            <button className="profile" onClick={() => { setAuthMode('login'); setAuthOpen(true) }}>
              <span className="avatar coral">{currentProfile.avatar}</span>
              <span>{currentProfile.nickname}<small>个人中心⌄</small></span>
            </button>
          </div>
        </header>

        {page === 'overview' && <Overview users={users} matches={matches} nameOf={nameOf} initials={initials} setPage={setPage} />}
        {page === 'record' && <Record users={users} onSubmit={addMatch} />}
        {page === 'players' && <Players users={users} />}
        {page === 'ranking' && <Ranking leaderboard={leaderboard} />}
      </main>

      {authOpen && (
        <div className="modal-backdrop" onClick={() => setAuthOpen(false)}>
          <section className="modal" onClick={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setAuthOpen(false)}>×</button>
            <div className="modal-logo">↗</div>
            <h2>{authMode === 'login' ? '欢迎回来' : '加入球友圈'}</h2>
            <p>{authMode === 'login' ? '登录后继续记录你的每一分' : '创建你的 Smash Track 档案'}</p>
            {authMode === 'login' ? (
              <form onSubmit={(event) => { event.preventDefault(); setAuthOpen(false); showToast('登录成功，欢迎回来') }}>
                <label>邮箱或昵称<input required placeholder="name@example.com" /></label>
                <label>密码<input required type="password" placeholder="••••••••" /></label>
                <button className="primary wide">登录</button>
                <button type="button" className="qq-button" onClick={() => showToast('QQ 登录将在接入 OAuth 后启用')}>◉ 使用 QQ 登录</button>
              </form>
            ) : (
              <form onSubmit={register}>
                <label>昵称<input name="nickname" required placeholder="你的球场昵称" /></label>
                <label>密码<input name="password" required type="password" minLength="6" placeholder="至少 6 位" /></label>
                <button className="primary wide">创建账号</button>
              </form>
            )}
            <button className="switch-auth" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
              {authMode === 'login' ? '还没有账号？立即注册' : '已有账号？返回登录'}
            </button>
          </section>
        </div>
      )}

      {toast && <div className="toast">✓ {toast}</div>}
    </div>
  )
}

function Overview({ users, matches, nameOf, initials, setPage }) {
  const primaryUser = getPrimaryUser(users)
  const winningRate = primaryUser.games ? Math.round((primaryUser.wins / primaryUser.games) * 100) : 0

  return (
    <>
      <section className="welcome-grid">
        <div className="hero-panel">
          <div className="hero-copy">
            <span className="tag">2026 · 夏季赛季</span>
            <h2>把热爱，<br /><em>打成记录。</em></h2>
            <p>今天也去球场，完成一场漂亮的对决。</p>
            <button className="primary" onClick={() => setPage('record')}>记录一场比赛 <span>↗</span></button>
          </div>
          <div className="court-graphic">
            <div className="court-net" />
            <div className="shuttle">◆</div>
            <div className="court-lines"><i /><i /><i /><i /><i /></div>
          </div>
        </div>

        <div className="stat-panel">
          <span className="panel-label">我的赛季表现</span>
          <div className="stat-number">{primaryUser.wins}<small>胜场</small></div>
          <div className="stat-bar"><i style={{ width: `${Math.min(100, (primaryUser.wins / Math.max(primaryUser.games, 1)) * 100)}%` }} /></div>
          <div className="stat-meta"><span>胜率 <b>{winningRate}%</b></span><span>总场次 <b>{primaryUser.games}</b></span></div>
          <p className="trend">↗ 比上月多赢 4 场</p>
        </div>
      </section>

      <section className="section-heading">
        <div><span className="panel-label">最近动态</span><h2>比赛记录</h2></div>
        <button className="text-button" onClick={() => setPage('record')}>查看全部 ↗</button>
      </section>

      <div className="content-grid">
        <div className="match-list">
          {matches.slice(0, 3).map((match) => (
            <div className="match-row" key={match.id}>
              <div className="match-date">{match.date.slice(5).replace('-', '/')}<small>{match.court}</small></div>
              <div className="players">
                <span className="avatar mint">{initials(match.winner)}</span>
                <b>{nameOf(match.winner)}</b>
                <span className="versus">VS</span>
                <span className="avatar lavender">{initials(match.loser)}</span>
                <b>{nameOf(match.loser)}</b>
              </div>
              <div className="score"><strong>{match.winnerScore}</strong><span>—</span>{match.loserScore}</div>
              <span className="win-pill">胜利</span>
            </div>
          ))}
        </div>

        <div className="ranking-card">
          <div className="card-title">
            <span>
              <span className="panel-label">赛季榜单</span>
              <h3>胜场排行榜</h3>
            </span>
            <button onClick={() => setPage('ranking')}>查看 ↗</button>
          </div>
          <ul>
            {[...users].sort((a, b) => b.wins - a.wins).slice(0, 4).map((user) => (
              <li key={user.id}><span>{user.nickname}</span><strong>{user.wins}</strong></li>
            ))}
          </ul>
        </div>
      </div>
    </>
  )
}

function Record({ users, onSubmit }) {
  return (
    <section className="form-layout">
      <div className="form-intro">
        <span className="tag">新比赛</span>
        <h2>记下这一场<br /><em>精彩对决。</em></h2>
        <p>每一次挥拍，都是下一次进步的坐标。填写比赛信息，让你的赛季轨迹更完整。</p>
        <div className="tip">✦ <span>小提示<br /><b>先选出胜者，再填写双方比分。</b></span></div>
      </div>
      <form className="match-form" onSubmit={onSubmit}>
        <div className="form-section">
          <span className="step">01</span>
          <div>
            <label>选择对阵双方</label>
            <div className="select-row">
              <select name="winner" defaultValue={users[0]?.id}>{users.map((user) => <option value={user.id} key={user.id}>{user.nickname}</option>)}</select>
              <span>VS</span>
              <select name="loser" defaultValue={users[1]?.id}>{users.map((user) => <option value={user.id} key={user.id}>{user.nickname}</option>)}</select>
            </div>
          </div>
        </div>
        <div className="form-section">
          <span className="step">02</span>
          <div>
            <label>比分情况</label>
            <div className="score-inputs">
              <input name="winnerScore" type="number" min="0" max="99" defaultValue="21" />
              <span>—</span>
              <input name="loserScore" type="number" min="0" max="99" defaultValue="17" />
            </div>
          </div>
        </div>
        <div className="form-section">
          <span className="step">03</span>
          <div className="full-field"><label>场地（可选）</label><input name="court" placeholder="例如：东区 03 号场" /></div>
        </div>
        <button className="primary wide" type="submit">保存这场比赛 <span>↗</span></button>
      </form>
    </section>
  )
}

function Players({ users }) {
  return (
    <section>
      <div className="section-heading">
        <div><span className="panel-label">用户库 · {users.length} 位球友</span><h2>认识你的对手，也认识自己</h2></div>
        <button className="primary">＋ 添加球友</button>
      </div>
      <div className="player-grid">
        {users.map((user) => (
          <article className="player-card" key={user.id}>
            <span className="avatar coral large">{user.avatar}</span>
            <h3>{user.nickname}</h3>
            <p>@{user.handle}</p>
            <span className="level">{user.level}</span>
            <div><b>{user.wins}</b> 胜场 <span>·</span> <b>{user.games}</b> 场比赛</div>
          </article>
        ))}
      </div>
    </section>
  )
}

function Ranking({ leaderboard }) {
  return (
    <section>
      <div className="ranking-header">
        <span className="tag">2026 · 夏季赛季</span>
        <h2>每一分，<em>都有名字。</em></h2>
        <p>按累计胜场排序，看看谁在这个赛季保持着最好的状态。</p>
      </div>
      <div className="full-ranking">
        {leaderboard.map((user, index) => (
          <div className={`full-rank-row ${index === 0 ? 'top-rank' : ''}`} key={user.id}>
            <b className="rank-num">{String(index + 1).padStart(2, '0')}</b>
            <span className="avatar coral large">{user.avatar}</span>
            <div>
              <h3>{user.nickname}</h3>
              <p>@{user.handle} · {user.level}</p>
            </div>
            <span className="games-played">{user.games} 场比赛</span>
            <strong>{user.wins}<small> 胜场</small></strong>
          </div>
        ))}
      </div>
    </section>
  )
}

export default App
