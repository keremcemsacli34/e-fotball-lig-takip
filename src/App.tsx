import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import './App.css'
import { isSupabaseConfigured, loadRemoteLeagueData, saveRemoteLeagueData } from './supabaseStore'

type Team = {
  id: string
  name: string
  owner: string
}

type Player = {
  id: string
  name: string
  power: number
  teamId: string
}

type Contribution = {
  id: string
  teamId: string
  scorerId: string
  assistId: string
}

type GoalDraft = {
  id: string
  teamId: string
  scorerName: string
  scorerPower: number
  assistName: string
  assistPower: number
}

type MatchStatus = 'scheduled' | 'played'

type Match = {
  id: string
  homeTeamId: string
  awayTeamId: string
  status: MatchStatus
  scheduledAt: string
  homeScore: number
  awayScore: number
  goals: Contribution[]
}

type LeagueData = {
  teams: Team[]
  players: Player[]
  matches: Match[]
}

type Tab = 'standings' | 'matches' | 'leaders' | 'manage'
type Theme = 'dark' | 'light'
type SyncStatus = 'local' | 'loading' | 'synced' | 'syncing' | 'error'

type Standing = Team & {
  played: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

const STORAGE_KEY = 'e-football-league-v1'
const THEME_KEY = 'e-football-theme'
const ADMIN_PASSWORD = '1234'

const now = new Date()
const today = now.toISOString().slice(0, 10)
const defaultTime = '20:00'
const defaultDateTime = `${today}T${defaultTime}`

const initialData: LeagueData = {
  teams: [
    { id: 'team-kerem', name: 'Kerem FC', owner: 'Kerem' },
    { id: 'team-ahmet', name: 'Ahmetspor', owner: 'Ahmet' },
    { id: 'team-mehmet', name: 'Mehmet United', owner: 'Mehmet' },
  ],
  players: [
    { id: 'player-kerem-yamal', name: 'Yamal', power: 99, teamId: 'team-kerem' },
    { id: 'player-kerem-mbappe', name: 'Mbappe', power: 100, teamId: 'team-kerem' },
    { id: 'player-kerem-pedri', name: 'Pedri', power: 96, teamId: 'team-kerem' },
    { id: 'player-ahmet-yamal', name: 'Yamal', power: 97, teamId: 'team-ahmet' },
    { id: 'player-ahmet-messi', name: 'Messi', power: 100, teamId: 'team-ahmet' },
    { id: 'player-ahmet-neymar', name: 'Neymar', power: 98, teamId: 'team-ahmet' },
    { id: 'player-mehmet-haaland', name: 'Haaland', power: 100, teamId: 'team-mehmet' },
    { id: 'player-mehmet-vini', name: 'Vinicius Jr', power: 99, teamId: 'team-mehmet' },
    { id: 'player-mehmet-bellingham', name: 'Bellingham', power: 98, teamId: 'team-mehmet' },
  ],
  matches: [
    {
      id: 'match-1',
      homeTeamId: 'team-kerem',
      awayTeamId: 'team-ahmet',
      status: 'played',
      scheduledAt: `${today}T19:30`,
      homeScore: 3,
      awayScore: 2,
      goals: [
        { id: 'goal-1', teamId: 'team-kerem', scorerId: 'player-kerem-yamal', assistId: 'player-kerem-pedri' },
        { id: 'goal-2', teamId: 'team-kerem', scorerId: 'player-kerem-mbappe', assistId: 'player-kerem-yamal' },
        { id: 'goal-3', teamId: 'team-kerem', scorerId: 'player-kerem-yamal', assistId: '' },
        { id: 'goal-4', teamId: 'team-ahmet', scorerId: 'player-ahmet-messi', assistId: 'player-ahmet-neymar' },
        { id: 'goal-5', teamId: 'team-ahmet', scorerId: 'player-ahmet-yamal', assistId: 'player-ahmet-messi' },
      ],
    },
    {
      id: 'match-2',
      homeTeamId: 'team-mehmet',
      awayTeamId: 'team-kerem',
      status: 'played',
      scheduledAt: `${today}T20:15`,
      homeScore: 1,
      awayScore: 1,
      goals: [
        { id: 'goal-6', teamId: 'team-mehmet', scorerId: 'player-mehmet-haaland', assistId: 'player-mehmet-vini' },
        { id: 'goal-7', teamId: 'team-kerem', scorerId: 'player-kerem-mbappe', assistId: 'player-kerem-pedri' },
      ],
    },
    {
      id: 'match-3',
      homeTeamId: 'team-ahmet',
      awayTeamId: 'team-mehmet',
      status: 'scheduled',
      scheduledAt: `${today}T22:00`,
      homeScore: 0,
      awayScore: 0,
      goals: [],
    },
  ],
}

const makeId = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const normalizeDateTime = (value: string | undefined) => {
  if (!value) return defaultDateTime
  return value.includes('T') ? value : `${value}T${defaultTime}`
}

const migrateData = (raw: unknown): LeagueData => {
  const candidate = raw as Partial<LeagueData>
  if (!Array.isArray(candidate.teams) || !Array.isArray(candidate.players) || !Array.isArray(candidate.matches)) {
    return initialData
  }

  return {
    teams: candidate.teams.map((team) => ({
      ...team,
      owner: (team as Team).owner || team.name,
    })),
    players: candidate.players,
    matches: candidate.matches.map((match) => {
      const legacy = match as Match & { playedAt?: string }
      return {
        id: legacy.id,
        homeTeamId: legacy.homeTeamId,
        awayTeamId: legacy.awayTeamId,
        status: legacy.status ?? 'played',
        scheduledAt: normalizeDateTime(legacy.scheduledAt ?? legacy.playedAt),
        homeScore: Number(legacy.homeScore ?? 0),
        awayScore: Number(legacy.awayScore ?? 0),
        goals: Array.isArray(legacy.goals) ? legacy.goals : [],
      }
    }),
  }
}

const loadData = (): LeagueData => {
  const saved = localStorage.getItem(STORAGE_KEY)
  if (!saved) return initialData

  try {
    return migrateData(JSON.parse(saved))
  } catch {
    return initialData
  }
}

const loadTheme = (): Theme => {
  return localStorage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark'
}

const sortStandings = (standings: Standing[]) =>
  [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.name.localeCompare(b.name)
  })

const formatMatchDate = (value: string) =>
  new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value))

const normalizePlayerName = (name: string) => name.trim().toLocaleLowerCase('tr-TR')

function App() {
  const [data, setData] = useState<LeagueData>(loadData)
  const initialDataRef = useRef(data)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(isSupabaseConfigured ? 'loading' : 'local')
  const [activeTab, setActiveTab] = useState<Tab>('standings')
  const [theme, setTheme] = useState<Theme>(loadTheme)
  const [isAdmin, setIsAdmin] = useState(false)
  const [adminPassword, setAdminPassword] = useState('')
  const [adminError, setAdminError] = useState('')
  const [teamName, setTeamName] = useState('')
  const [teamOwner, setTeamOwner] = useState('')
  const [editingTeamId, setEditingTeamId] = useState('')
  const [editingMatchId, setEditingMatchId] = useState('')
  const [matchDraft, setMatchDraft] = useState({
    homeTeamId: data.teams[0]?.id ?? '',
    awayTeamId: data.teams[1]?.id ?? '',
    status: 'played' as MatchStatus,
    scheduledAt: defaultDateTime,
    homeScore: 0,
    awayScore: 0,
  })
  const [goalDrafts, setGoalDrafts] = useState<GoalDraft[]>([])

  useEffect(() => {
    let isActive = true

    if (!isSupabaseConfigured) return

    const loadSharedData = async () => {
      try {
        const remoteData = await loadRemoteLeagueData()
        if (!isActive) return

        if (remoteData) {
          const migratedData = migrateData(remoteData)
          setData(migratedData)
          localStorage.setItem(STORAGE_KEY, JSON.stringify(migratedData))
        } else {
          await saveRemoteLeagueData(initialDataRef.current)
        }

        if (isActive) setSyncStatus('synced')
      } catch {
        if (isActive) setSyncStatus('error')
      }
    }

    void loadSharedData()

    return () => {
      isActive = false
    }
  }, [])

  const saveData = (nextData: LeagueData) => {
    setData(nextData)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData))

    if (isSupabaseConfigured) {
      setSyncStatus('syncing')
      void saveRemoteLeagueData(nextData)
        .then(() => setSyncStatus('synced'))
        .catch(() => setSyncStatus('error'))
    }
  }

  const teamById = useMemo(
    () => new Map(data.teams.map((team) => [team.id, team])),
    [data.teams],
  )

  const playerById = useMemo(
    () => new Map(data.players.map((player) => [player.id, player])),
    [data.players],
  )

  const playedMatches = useMemo(
    () => data.matches.filter((match) => match.status === 'played').sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt)),
    [data.matches],
  )

  const scheduledMatches = useMemo(
    () => data.matches.filter((match) => match.status === 'scheduled').sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)),
    [data.matches],
  )

  const standings = useMemo(() => {
    const table = new Map<string, Standing>()

    data.teams.forEach((team) => {
      table.set(team.id, {
        ...team,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      })
    })

    playedMatches.forEach((match) => {
      const home = table.get(match.homeTeamId)
      const away = table.get(match.awayTeamId)
      if (!home || !away) return

      home.played += 1
      away.played += 1
      home.goalsFor += match.homeScore
      home.goalsAgainst += match.awayScore
      away.goalsFor += match.awayScore
      away.goalsAgainst += match.homeScore

      if (match.homeScore > match.awayScore) {
        home.points += 3
      } else if (match.homeScore < match.awayScore) {
        away.points += 3
      } else {
        home.points += 1
        away.points += 1
      }

      home.goalDifference = home.goalsFor - home.goalsAgainst
      away.goalDifference = away.goalsFor - away.goalsAgainst
    })

    return sortStandings([...table.values()])
  }, [data.teams, playedMatches])

  const leaders = useMemo(() => {
    const goals = new Map<string, number>()
    const assists = new Map<string, number>()

    playedMatches.forEach((match) => {
      match.goals.forEach((goal) => {
        goals.set(goal.scorerId, (goals.get(goal.scorerId) ?? 0) + 1)
        if (goal.assistId) {
          assists.set(goal.assistId, (assists.get(goal.assistId) ?? 0) + 1)
        }
      })
    })

    const toRows = (stats: Map<string, number>) =>
      [...stats.entries()]
        .map(([playerId, value]) => ({ player: playerById.get(playerId), value }))
        .filter((row): row is { player: Player; value: number } => Boolean(row.player))
        .sort((a, b) => b.value - a.value || b.player.power - a.player.power || a.player.name.localeCompare(b.player.name))

    return {
      scorers: toRows(goals),
      assists: toRows(assists),
    }
  }, [playedMatches, playerById])

  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark'
    setTheme(nextTheme)
    localStorage.setItem(THEME_KEY, nextTheme)
  }

  const openAdmin = (event: FormEvent) => {
    event.preventDefault()
    if (adminPassword === ADMIN_PASSWORD) {
      setIsAdmin(true)
      setAdminError('')
      setActiveTab('manage')
      return
    }

    setAdminError('Şifre hatalı. İlk sürüm şifresi: 1234')
  }

  const closeAdmin = () => {
    setIsAdmin(false)
    setAdminPassword('')
    setAdminError('')
    setEditingMatchId('')
    setEditingTeamId('')
    setTeamName('')
    setTeamOwner('')
    setActiveTab('standings')
  }

  const clearTeamForm = () => {
    setEditingTeamId('')
    setTeamName('')
    setTeamOwner('')
  }

  const editTeam = (team: Team) => {
    setEditingTeamId(team.id)
    setTeamName(team.name)
    setTeamOwner(team.owner)
  }

  const saveTeam = (event: FormEvent) => {
    event.preventDefault()
    const trimmedName = teamName.trim()
    const trimmedOwner = teamOwner.trim()
    if (!trimmedName) return

    if (editingTeamId) {
      saveData({
        ...data,
        teams: data.teams.map((team) => (
          team.id === editingTeamId
            ? { ...team, name: trimmedName, owner: trimmedOwner || trimmedName }
            : team
        )),
      })
      clearTeamForm()
      return
    }

    const newTeam = { id: makeId('team'), name: trimmedName, owner: trimmedOwner || trimmedName }
    saveData({ ...data, teams: [...data.teams, newTeam] })
    clearTeamForm()
    if (!matchDraft.homeTeamId) {
      setMatchDraft({ ...matchDraft, homeTeamId: newTeam.id })
    }
  }

  const deleteTeam = (teamId: string) => {
    const nextTeams = data.teams.filter((team) => team.id !== teamId)
    const nextPlayers = data.players.filter((player) => player.teamId !== teamId)
    const nextMatches = data.matches.filter((match) => match.homeTeamId !== teamId && match.awayTeamId !== teamId)
    const fallbackHome = nextTeams[0]?.id ?? ''
    const fallbackAway = nextTeams.find((team) => team.id !== fallbackHome)?.id ?? ''

    saveData({ teams: nextTeams, players: nextPlayers, matches: nextMatches })
    if (editingTeamId === teamId) {
      clearTeamForm()
    }
    setMatchDraft((current) => ({
      ...current,
      homeTeamId: current.homeTeamId === teamId ? fallbackHome : current.homeTeamId,
      awayTeamId: current.awayTeamId === teamId ? fallbackAway : current.awayTeamId,
    }))
    setGoalDrafts([])
  }

  const addGoalDraft = (teamId: string) => {
    setGoalDrafts([
      ...goalDrafts,
      {
        id: makeId('draft-goal'),
        teamId,
        scorerName: '',
        scorerPower: 99,
        assistName: '',
        assistPower: 99,
      },
    ])
  }

  const updateGoalDraft = (goalId: string, patch: Partial<GoalDraft>) => {
    setGoalDrafts(
      goalDrafts.map((goal) => {
        if (goal.id !== goalId) return goal
        return { ...goal, ...patch }
      }),
    )
  }

  const removeGoalDraft = (goalId: string) => {
    setGoalDrafts(goalDrafts.filter((goal) => goal.id !== goalId))
  }

  const homeGoalTarget = Math.max(0, Number(matchDraft.homeScore) || 0)
  const awayGoalTarget = Math.max(0, Number(matchDraft.awayScore) || 0)
  const totalGoalTarget = homeGoalTarget + awayGoalTarget
  const homeGoalCount = goalDrafts.filter((goal) => goal.teamId === matchDraft.homeTeamId).length
  const awayGoalCount = goalDrafts.filter((goal) => goal.teamId === matchDraft.awayTeamId).length
  const teamGoalCounts = new Map<string, number>([
    [matchDraft.homeTeamId, homeGoalCount],
    [matchDraft.awayTeamId, awayGoalCount],
  ])
  const teamGoalTargets = new Map<string, number>([
    [matchDraft.homeTeamId, homeGoalTarget],
    [matchDraft.awayTeamId, awayGoalTarget],
  ])
  const getTeamGoalState = (teamId: string) => {
    const count = teamGoalCounts.get(teamId) ?? 0
    const target = teamGoalTargets.get(teamId) ?? 0
    return { count, isFull: count >= target, target }
  }
  const goalValidationMessages = matchDraft.status === 'played'
    ? [
      goalDrafts.length !== totalGoalTarget
        ? `Skor toplamı ${totalGoalTarget} gol, ama ${goalDrafts.length} gol detayı var.`
        : '',
      homeGoalCount !== homeGoalTarget
        ? `${teamById.get(matchDraft.homeTeamId)?.name ?? 'Ev sahibi'} için ${homeGoalTarget} gol gerekli, ${homeGoalCount} girildi.`
        : '',
      awayGoalCount !== awayGoalTarget
        ? `${teamById.get(matchDraft.awayTeamId)?.name ?? 'Deplasman'} için ${awayGoalTarget} gol gerekli, ${awayGoalCount} girildi.`
        : '',
      ...goalDrafts.flatMap((goal, index) => {
        const messages: string[] = []
        const scorerName = normalizePlayerName(goal.scorerName)
        const assistName = normalizePlayerName(goal.assistName)

        if (!scorerName) {
          messages.push(`${index + 1}. gol için gol atan zorunlu.`)
        }
        if (scorerName && assistName && scorerName === assistName) {
          messages.push(`${index + 1}. golde gol atan ve asist yapan aynı olamaz.`)
        }

        return messages
      }),
    ].filter(Boolean)
    : []
  const hasGoalErrors = goalValidationMessages.length > 0

  const editMatch = (match: Match) => {
    setEditingMatchId(match.id)
    setMatchDraft({
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      status: match.status,
      scheduledAt: match.scheduledAt,
      homeScore: match.homeScore,
      awayScore: match.awayScore,
    })
    setGoalDrafts(
      match.goals.map((goal) => {
        const scorer = playerById.get(goal.scorerId)
        const assist = playerById.get(goal.assistId)

        return {
          id: goal.id,
          teamId: goal.teamId,
          scorerName: scorer?.name ?? '',
          scorerPower: scorer?.power ?? 99,
          assistName: assist?.name ?? '',
          assistPower: assist?.power ?? 99,
        }
      }),
    )
    setIsAdmin(true)
    setActiveTab('manage')
  }

  const clearMatchForm = () => {
    setEditingMatchId('')
    setMatchDraft({
      homeTeamId: data.teams[0]?.id ?? '',
      awayTeamId: data.teams[1]?.id ?? '',
      status: 'played',
      scheduledAt: defaultDateTime,
      homeScore: 0,
      awayScore: 0,
    })
    setGoalDrafts([])
  }

  const saveMatch = (event: FormEvent) => {
    event.preventDefault()
    if (!matchDraft.homeTeamId || !matchDraft.awayTeamId || matchDraft.homeTeamId === matchDraft.awayTeamId) return
    if (hasGoalErrors) return

    const players = [...data.players]
    const findOrCreatePlayer = (teamId: string, name: string, power: number) => {
      const cleanName = name.trim()
      if (!cleanName) return ''

      const existingPlayer = players.find(
        (player) => player.teamId === teamId && normalizePlayerName(player.name) === normalizePlayerName(cleanName),
      )

      if (existingPlayer) {
        existingPlayer.power = Math.max(1, Math.min(120, power))
        return existingPlayer.id
      }

      const newPlayer = {
        id: makeId('player'),
        name: cleanName,
        power: Math.max(1, Math.min(120, power)),
        teamId,
      }
      players.push(newPlayer)
      return newPlayer.id
    }

    const goals = matchDraft.status === 'played'
      ? goalDrafts
        .map((goal) => ({
          id: makeId('goal'),
          teamId: goal.teamId,
          scorerId: findOrCreatePlayer(goal.teamId, goal.scorerName, goal.scorerPower),
          assistId: findOrCreatePlayer(goal.teamId, goal.assistName, goal.assistPower),
        }))
        .filter((goal) => goal.scorerId)
      : []

    const nextMatch = {
      id: editingMatchId || makeId('match'),
      homeTeamId: matchDraft.homeTeamId,
      awayTeamId: matchDraft.awayTeamId,
      status: matchDraft.status,
      scheduledAt: matchDraft.scheduledAt,
      homeScore: matchDraft.status === 'played' ? Number(matchDraft.homeScore) : 0,
      awayScore: matchDraft.status === 'played' ? Number(matchDraft.awayScore) : 0,
      goals,
    }

    saveData({
      ...data,
      players,
      matches: editingMatchId
        ? data.matches.map((match) => (match.id === editingMatchId ? nextMatch : match))
        : [...data.matches, nextMatch],
    })
    clearMatchForm()
    setActiveTab('matches')
  }

  const deleteMatch = (matchId: string) => {
    saveData({ ...data, matches: data.matches.filter((match) => match.id !== matchId) })
  }

  const resetDemo = () => {
    saveData(initialData)
    setGoalDrafts([])
    setEditingMatchId('')
    setMatchDraft({
      homeTeamId: initialData.teams[0].id,
      awayTeamId: initialData.teams[1].id,
      status: 'played',
      scheduledAt: defaultDateTime,
      homeScore: 0,
      awayScore: 0,
    })
  }

  const availableMatchTeams = [matchDraft.homeTeamId, matchDraft.awayTeamId].filter(Boolean)
  const canCreateMatch = data.teams.length >= 2

  return (
    <div className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div>
          <p className="eyebrow">e-football lig</p>
          <h1>Mevcut Lig</h1>
          <span className={`sync-pill ${syncStatus}`}>
            {syncStatus === 'local' && 'Yerel veri'}
            {syncStatus === 'loading' && 'Ortak veri yükleniyor'}
            {syncStatus === 'syncing' && 'Kaydediliyor'}
            {syncStatus === 'synced' && 'Ortak veri aktif'}
            {syncStatus === 'error' && 'Bağlantı hatası'}
          </span>
        </div>

        <div className="top-actions">
          <button className="icon-button ghost" type="button" onClick={toggleTheme} aria-label="Temayı değiştir">
            <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
          </button>
          {isAdmin ? (
            <button className="icon-button danger" type="button" onClick={closeAdmin} aria-label="Yönetici modunu kapat">
              <Icon name="close" />
            </button>
          ) : (
            <form className="admin-login" onSubmit={openAdmin}>
              <input
                aria-label="Yönetici şifresi"
                inputMode="numeric"
                placeholder="Şifre"
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
              />
              <button className="icon-button" type="submit" aria-label="Yönetici moduna geç">
                <Icon name="lock" />
              </button>
            </form>
          )}
        </div>
      </header>

      {adminError && <p className="notice">{adminError}</p>}

      <main>
        {activeTab === 'standings' && (
          <section className="view">
            <div className="section-title">
              <Icon name="chart" />
              <h2>Puan Durumu</h2>
            </div>
            <div className="table-wrap">
              <table className="standings-table">
                <thead>
                  <tr>
                    <th>Takım</th>
                    <th>O</th>
                    <th>AV</th>
                    <th>P</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((team, index) => (
                    <tr key={team.id}>
                      <td>
                        <span className="rank">{index + 1}</span>
                        <TeamLabel team={team} />
                      </td>
                      <td>{team.played}</td>
                      <td>{team.goalDifference > 0 ? `+${team.goalDifference}` : team.goalDifference}</td>
                      <td className="points">{team.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'matches' && (
          <section className="view">
            <div className="section-title">
              <Icon name="list" />
              <h2>Maçlar</h2>
            </div>

            <MatchSection
              emptyText="Planlanmış maç yok."
              isAdmin={isAdmin}
              matches={scheduledMatches}
              onDelete={deleteMatch}
              onEdit={editMatch}
              teamById={teamById}
              title="Gelecek Maçlar"
              variant="scheduled"
            />
            <MatchSection
              emptyText="Oynanmış maç yok."
              isAdmin={isAdmin}
              matches={playedMatches}
              onDelete={deleteMatch}
              onEdit={editMatch}
              teamById={teamById}
              title="Geçmiş Maçlar"
              variant="played"
            />
          </section>
        )}

        {activeTab === 'leaders' && (
          <section className="view split-view">
            <LeaderBoard
              title="Gol Krallığı"
              icon={<Icon name="crown" />}
              rows={leaders.scorers}
              suffix="gol"
              teamById={teamById}
            />
            <LeaderBoard
              title="Asist Krallığı"
              icon={<Icon name="trophy" />}
              rows={leaders.assists}
              suffix="asist"
              teamById={teamById}
            />
          </section>
        )}

        {activeTab === 'manage' && (
          <section className="view manage-view">
            {!isAdmin ? (
              <div className="locked">
                <Icon name="lock" />
                <h2>Yönetici modu kapalı</h2>
                <p>Üstteki şifre alanından giriş yapınca maç, fikstür ve takım yönetimi açılır.</p>
              </div>
            ) : (
              <>
                <div className="section-title">
                  <Icon name="edit" />
                  <h2>Yönet</h2>
                </div>

                <form className="form-panel" onSubmit={saveMatch}>
                  <div className="form-heading">
                    <h3>{editingMatchId ? 'Maçı Düzenle' : 'Maç Ekle'}</h3>
                    {editingMatchId && (
                      <button className="text-button" type="button" onClick={clearMatchForm}>
                        Vazgeç
                      </button>
                    )}
                  </div>
                  <div className="segmented-control" aria-label="Maç tipi">
                    <button
                      className={matchDraft.status === 'scheduled' ? 'selected' : ''}
                      type="button"
                      onClick={() => {
                        setMatchDraft({ ...matchDraft, status: 'scheduled' })
                        setGoalDrafts([])
                      }}
                    >
                      Oynanacak
                    </button>
                    <button
                      className={matchDraft.status === 'played' ? 'selected' : ''}
                      type="button"
                      onClick={() => setMatchDraft({ ...matchDraft, status: 'played' })}
                    >
                      Oynandı
                    </button>
                  </div>

                  {canCreateMatch ? (
                    <>
                      <div className="form-grid two">
                        <label>
                          Ev sahibi
                          <select
                            value={matchDraft.homeTeamId}
                            onChange={(event) => {
                              setMatchDraft({ ...matchDraft, homeTeamId: event.target.value })
                              setGoalDrafts([])
                            }}
                          >
                            {data.teams.map((team) => (
                              <option value={team.id} key={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Deplasman
                          <select
                            value={matchDraft.awayTeamId}
                            onChange={(event) => {
                              setMatchDraft({ ...matchDraft, awayTeamId: event.target.value })
                              setGoalDrafts([])
                            }}
                          >
                            {data.teams.map((team) => (
                              <option value={team.id} key={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Tarih ve saat
                          <input
                            type="datetime-local"
                            value={matchDraft.scheduledAt}
                            onChange={(event) => setMatchDraft({ ...matchDraft, scheduledAt: event.target.value })}
                          />
                        </label>
                        {matchDraft.status === 'played' && (
                          <>
                            <label>
                              Ev skoru
                              <input
                                type="number"
                                min="0"
                                value={matchDraft.homeScore}
                                onChange={(event) => setMatchDraft({ ...matchDraft, homeScore: Number(event.target.value) })}
                              />
                            </label>
                            <label>
                              Dep skoru
                              <input
                                type="number"
                                min="0"
                                value={matchDraft.awayScore}
                                onChange={(event) => setMatchDraft({ ...matchDraft, awayScore: Number(event.target.value) })}
                              />
                            </label>
                          </>
                        )}
                      </div>

                      {matchDraft.status === 'played' && (
                        <>
                          <div className="goal-actions">
                            {availableMatchTeams.map((teamId) => {
                              const goalState = getTeamGoalState(teamId)

                              return (
                                <button
                                  type="button"
                                  className="secondary-button"
                                  disabled={goalState.isFull}
                                  onClick={() => addGoalDraft(teamId)}
                                  key={teamId}
                                >
                                  <Icon name="plus" />
                                  {teamById.get(teamId)?.name} golü {goalState.count}/{goalState.target}
                                </button>
                              )
                            })}
                          </div>

                          {goalValidationMessages.length > 0 && (
                            <div className="validation-panel">
                              {goalValidationMessages.map((message) => (
                                <p key={message}>{message}</p>
                              ))}
                            </div>
                          )}

                          {goalDrafts.map((goal, index) => {
                            const scorerName = normalizePlayerName(goal.scorerName)
                            const assistName = normalizePlayerName(goal.assistName)
                            const hasCardError = !scorerName || Boolean(assistName && scorerName === assistName)

                            return (
                              <article className={`goal-card ${hasCardError ? 'has-error' : ''}`} key={goal.id}>
                                <div className="goal-card-header">
                                  <strong>{index + 1}. gol</strong>
                                  <button className="text-button danger" type="button" onClick={() => removeGoalDraft(goal.id)}>
                                    Sil
                                  </button>
                                </div>
                                <div className="goal-editor">
                                <select value={goal.teamId} onChange={(event) => updateGoalDraft(goal.id, { teamId: event.target.value })}>
                                  {availableMatchTeams.map((teamId) => (
                                    <option value={teamId} key={teamId}>{teamById.get(teamId)?.name}</option>
                                  ))}
                                </select>
                                <input
                                  value={goal.scorerName}
                                  onChange={(event) => updateGoalDraft(goal.id, { scorerName: event.target.value })}
                                  placeholder="Gol atan"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  max="120"
                                  value={goal.scorerPower}
                                  onChange={(event) => updateGoalDraft(goal.id, { scorerPower: Number(event.target.value) })}
                                  aria-label="Gol atan gücü"
                                />
                                <input
                                  value={goal.assistName}
                                  onChange={(event) => updateGoalDraft(goal.id, { assistName: event.target.value })}
                                  placeholder="Asist yoksa boş"
                                />
                                <input
                                  type="number"
                                  min="1"
                                  max="120"
                                  value={goal.assistPower}
                                  onChange={(event) => updateGoalDraft(goal.id, { assistPower: Number(event.target.value) })}
                                  aria-label="Asist yapan gücü"
                                />
                                </div>
                              </article>
                            )
                          })}
                        </>
                      )}

                      <button className="primary-button" type="submit" disabled={hasGoalErrors}>
                        {editingMatchId ? 'Değişiklikleri Kaydet' : matchDraft.status === 'played' ? 'Maçı Kaydet' : 'Fikstüre Ekle'}
                      </button>
                    </>
                  ) : (
                    <p className="empty">Maç eklemek için en az iki takım olmalı.</p>
                  )}
                </form>

                <form className="form-panel" onSubmit={saveTeam}>
                  <div className="form-heading">
                    <h3>{editingTeamId ? 'Takımı Düzenle' : 'Takımlar'}</h3>
                    {editingTeamId && (
                      <button className="text-button" type="button" onClick={clearTeamForm}>
                        Vazgeç
                      </button>
                    )}
                  </div>
                  <div className="team-create-grid">
                    <input value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Takım adı" />
                    <input value={teamOwner} onChange={(event) => setTeamOwner(event.target.value)} placeholder="Sahibi" />
                    <button className="icon-button" type="submit" aria-label="Takım ekle">
                      <Icon name={editingTeamId ? 'check' : 'plus'} />
                    </button>
                  </div>
                  <div className="team-manage-list">
                    {data.teams.map((team) => (
                      <div className="team-manage-row" key={team.id}>
                        <TeamLabel team={team} />
                        <div className="team-actions">
                          <button className="text-button" type="button" onClick={() => editTeam(team)}>
                            Düzenle
                          </button>
                          <button className="text-button danger" type="button" onClick={() => deleteTeam(team.id)}>
                            Sil
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </form>

                <button className="text-button danger" type="button" onClick={resetDemo}>
                  Örnek veriye dön
                </button>
              </>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Ana menü">
        <NavButton active={activeTab === 'standings'} onClick={() => setActiveTab('standings')} icon={<Icon name="chart" />} label="Puan" />
        <NavButton active={activeTab === 'matches'} onClick={() => setActiveTab('matches')} icon={<Icon name="list" />} label="Maçlar" />
        <NavButton active={activeTab === 'leaders'} onClick={() => setActiveTab('leaders')} icon={<Icon name="crown" />} label="Krallık" />
        <NavButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} icon={<Icon name={isAdmin ? 'edit' : 'shield'} />} label="Yönet" />
      </nav>
    </div>
  )
}

function MatchSection({
  emptyText,
  isAdmin,
  matches,
  onDelete,
  onEdit,
  teamById,
  title,
  variant,
}: {
  emptyText: string
  isAdmin: boolean
  matches: Match[]
  onDelete: (matchId: string) => void
  onEdit: (match: Match) => void
  teamById: Map<string, Team>
  title: string
  variant: MatchStatus
}) {
  return (
    <section className="match-section">
      <div className="subsection-title">
        <h3>{title}</h3>
        <span>{matches.length}</span>
      </div>
      <div className="match-list">
        {matches.length ? (
          matches.map((match) => (
            <article className="match-row" key={match.id}>
              <span>{formatMatchDate(match.scheduledAt)}</span>
              <div>
                <strong>
                  <TeamLabel team={teamById.get(match.homeTeamId)} compact />
                </strong>
                <b>{variant === 'played' ? `${match.homeScore} - ${match.awayScore}` : 'vs'}</b>
                <strong>
                  <TeamLabel team={teamById.get(match.awayTeamId)} compact align="right" />
                </strong>
              </div>
              {isAdmin && (
                <div className="match-actions">
                  <button type="button" className="text-button" onClick={() => onEdit(match)}>
                    Düzenle
                  </button>
                  <button type="button" className="text-button danger" onClick={() => onDelete(match.id)}>
                    Sil
                  </button>
                </div>
              )}
            </article>
          ))
        ) : (
          <p className="empty-box">{emptyText}</p>
        )}
      </div>
    </section>
  )
}

function TeamLabel({
  align = 'left',
  compact = false,
  team,
}: {
  align?: 'left' | 'right'
  compact?: boolean
  team?: Team
}) {
  if (!team) return <span className="team-label">Takım yok</span>

  return (
    <span className={`team-label ${compact ? 'compact' : ''} ${align === 'right' ? 'right' : ''}`}>
      <span>{team.name}</span>
      <small>{team.owner}</small>
    </span>
  )
}

function LeaderBoard({
  title,
  icon,
  rows,
  suffix,
  teamById,
}: {
  title: string
  icon: ReactNode
  rows: { player: Player; value: number }[]
  suffix: string
  teamById: Map<string, Team>
}) {
  return (
    <article className="leader-panel">
      <div className="section-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {rows.length ? (
        rows.map((row, index) => (
          <div className="leader-row" key={row.player.id}>
            <span className="rank">{index + 1}</span>
            <div>
              <strong>{row.player.name}</strong>
              <small>{teamById.get(row.player.teamId)?.name} · {row.player.power} güç</small>
            </div>
            <b>{row.value} {suffix}</b>
          </div>
        ))
      ) : (
        <p className="empty">Henüz kayıt yok.</p>
      )}
    </article>
  )
}

function NavButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean
  onClick: () => void
  icon: ReactNode
  label: string
}) {
  return (
    <button className={active ? 'active' : ''} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function Icon({ name }: { name: 'chart' | 'check' | 'close' | 'crown' | 'edit' | 'list' | 'lock' | 'moon' | 'plus' | 'shield' | 'sun' | 'trophy' }) {
  const paths = {
    chart: (
      <>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M8 16v-5" />
        <path d="M12 16V8" />
        <path d="M16 16v-3" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: (
      <>
        <path d="m6 6 12 12" />
        <path d="m18 6-12 12" />
      </>
    ),
    crown: (
      <>
        <path d="m4 8 4 4 4-7 4 7 4-4-2 10H6L4 8Z" />
        <path d="M6 21h12" />
      </>
    ),
    edit: (
      <>
        <path d="M4 20h4l10-10-4-4L4 16v4Z" />
        <path d="m13 7 4 4" />
      </>
    ),
    list: (
      <>
        <path d="M8 6h12" />
        <path d="M8 12h12" />
        <path d="M8 18h12" />
        <path d="M4 6h.01" />
        <path d="M4 12h.01" />
        <path d="M4 18h.01" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="11" width="14" height="9" rx="2" />
        <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      </>
    ),
    moon: <path d="M21 13a8 8 0 1 1-10-10 7 7 0 0 0 10 10Z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    shield: <path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6l-7-3Z" />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2" />
        <path d="M12 20v2" />
        <path d="m4.93 4.93 1.41 1.41" />
        <path d="m17.66 17.66 1.41 1.41" />
        <path d="M2 12h2" />
        <path d="M20 12h2" />
        <path d="m6.34 17.66-1.41 1.41" />
        <path d="m19.07 4.93-1.41 1.41" />
      </>
    ),
    trophy: (
      <>
        <path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" />
        <path d="M8 6H5a3 3 0 0 0 3 3" />
        <path d="M16 6h3a3 3 0 0 1-3 3" />
        <path d="M12 13v5" />
        <path d="M9 21h6" />
      </>
    ),
  }

  return (
    <svg aria-hidden="true" className="app-icon" fill="none" height="20" viewBox="0 0 24 24" width="20">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2">
        {paths[name]}
      </g>
    </svg>
  )
}

export default App
