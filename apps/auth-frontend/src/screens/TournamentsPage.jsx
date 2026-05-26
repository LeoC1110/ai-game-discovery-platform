// src/screens/TournamentsPage.jsx
import React, { useState } from 'react';
import { gql, useQuery, useMutation } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import ThreeBackground from '../components/ThreeBackground';
import DashboardNav from '../components/DashboardNav';
import './Tournaments.css';

const GET_TOURNAMENTS = gql`
  query GetTournaments {
    tournaments {
      id
      name
      game
      date
      status
      launchType
      launchUrl
      embedUrl
      rules
      scoreRules
      prizePool
      linkedGame {
        id
        title
      }
      players {
        id
        user {
          id
          username
        }
      }
    }
    myGames {
      id
      title
    }
    players {
      id
      user {
        id
        username
      }
    }
    me {
      id
      username
      role
    }
  }
`;

const CREATE_TOURNAMENT = gql`
  mutation CreateTournament($input: TournamentInput!) {
    createTournament(input: $input) {
      id
      name
    }
  }
`;

const DELETE_TOURNAMENT = gql`
  mutation DeleteTournament($id: ID!) {
    deleteTournament(id: $id)
  }
`;

const ADD_PLAYER_TO_TOURNAMENT = gql`
  mutation AddPlayerToTournament($tournamentId: ID!, $playerId: ID!) {
    addPlayerToTournament(tournamentId: $tournamentId, playerId: $playerId) {
      id
    }
  }
`;

const EXTENDED_TOURNAMENT = {
  name: '',
  game: '',
  date: '',
  status: 'Upcoming',
  launchType: 'Local',
  launchUrl: '',
  embedUrl: '',
  gameId: '',
  rules: '',
  scoreRules: '',
  prizePool: '',
};

export default function TournamentsPage() {
  const { data, loading, error, refetch } = useQuery(GET_TOURNAMENTS, {
    fetchPolicy: 'cache-and-network',
  });
  const [form, setForm] = useState(EXTENDED_TOURNAMENT);
  const [expandedId, setExpandedId] = useState(null);
  const [assignPlayer, setAssignPlayer] = useState({});
  const [activeLaunch, setActiveLaunch] = useState(null);
  const navigate = useNavigate();

  const [createTournament, { loading: creating }] = useMutation(CREATE_TOURNAMENT, {
    onCompleted: () => refetch(),
  });
  const [deleteTournament] = useMutation(DELETE_TOURNAMENT, {
    onCompleted: () => refetch(),
  });
  const [addPlayerToTournament] = useMutation(ADD_PLAYER_TO_TOURNAMENT, {
    onCompleted: () => refetch(),
  });

  if (loading) {
    return <div style={{ padding: 20, color: '#fff' }}>Loading…</div>;
  }
  if (error) {
    return <div style={{ padding: 20, color: '#ff6b6b' }}>Error: {error.message}</div>;
  }

  const tournaments = data?.tournaments ?? [];
  const games = data?.myGames ?? [];
  const players = data?.players ?? [];
  const me = data?.me;
  const isAdmin = me?.role === 'Admin';

  const myPlayer = players.find((p) => p.user.id === me?.id);
  const myPlayerId = myPlayer?.id;

  const myTournamentIds = tournaments
    .filter((t) => t.players.some((p) => p.user.id === me?.id))
    .map((t) => t.id);

  const handleCreate = async (event) => {
    event.preventDefault();
    const referencedGame = games.find((g) => g.id === form.gameId);
    const tournamentGame = form.game || referencedGame?.title || '';
    const input = {
      name: form.name,
      game: tournamentGame,
      date: form.date || undefined,
      status: form.status,
      launchType: form.launchType,
      launchUrl: form.launchType === 'ExternalLink' ? form.launchUrl || undefined : undefined,
      embedUrl: form.launchType === 'Embeddable' ? form.embedUrl || undefined : undefined,
      gameId: form.gameId || undefined,
      rules: form.rules || undefined,
      scoreRules: form.scoreRules || undefined,
      prizePool: form.prizePool || undefined,
    };

    if (!input.game) {
      window.alert('Please provide a game title or choose a library entry.');
      return;
    }

    await createTournament({ variables: { input } });
    setForm(EXTENDED_TOURNAMENT);
  };

  const handleJoin = async (tournamentId) => {
    if (!myPlayerId) {
      window.alert('You are not registered as a player.');
      return;
    }
    await addPlayerToTournament({ variables: { tournamentId, playerId: myPlayerId } });
  };

  const handleAssignPlayer = async (tournamentId) => {
    const playerId = assignPlayer[tournamentId];
    if (!playerId) {
      return;
    }
    await addPlayerToTournament({ variables: { tournamentId, playerId } });
    setAssignPlayer((prev) => ({ ...prev, [tournamentId]: '' }));
  };

  const handleLaunch = (tournament) => {
    if (tournament.launchType === 'ExternalLink' && tournament.launchUrl) {
      window.open(tournament.launchUrl, '_blank', 'noopener');
    }
    if (tournament.launchType === 'Embeddable' && tournament.embedUrl) {
      setActiveLaunch({ title: tournament.name, url: tournament.embedUrl });
    }
  };

  return (
    <div className="app-root">
      <ThreeBackground />
      <div className="bg-vignette" />

      <div className="app-container tournaments">
        <DashboardNav />
        <h1 className="app-title">Tournaments</h1>

        {isAdmin && (
          <div className="card tournaments-card tournaments-card--form">
            <form onSubmit={handleCreate} className="game-form tournaments-form">
              <input
                className="input"
                placeholder="Name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                required
              />
              <input
                className="input"
                placeholder="Game"
                value={form.game}
                onChange={(event) => setForm({ ...form, game: event.target.value })}
              />
              <label className="form-field">
                Link Library Game
                <select
                  className="input"
                  value={form.gameId}
                  onChange={(event) => {
                    const gameId = event.target.value;
                    const libraryGame = games.find((g) => g.id === gameId);
                    setForm((prev) => ({
                      ...prev,
                      gameId,
                      game: prev.game || libraryGame?.title || '',
                    }));
                  }}
                >
                  <option value="">None</option>
                  {games.map((gameOption) => (
                    <option key={gameOption.id} value={gameOption.id}>{gameOption.title}</option>
                  ))}
                </select>
              </label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(event) => setForm({ ...form, date: event.target.value })}
                required
              />
              <select
                className="input"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="Upcoming">Upcoming</option>
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
              </select>
              <label className="form-field">
                Launch Type
                <select
                  className="input"
                  value={form.launchType}
                  onChange={(event) => setForm({ ...form, launchType: event.target.value })}
                >
                  <option value="Local">Local</option>
                  <option value="ExternalLink">External Link</option>
                  <option value="Embeddable">Embeddable</option>
                </select>
              </label>
              {form.launchType === 'ExternalLink' && (
                <label className="form-field">
                  Launch URL
                  <input
                    className="input"
                    placeholder="https://..."
                    value={form.launchUrl}
                    onChange={(event) => setForm({ ...form, launchUrl: event.target.value })}
                    required
                  />
                </label>
              )}
              {form.launchType === 'Embeddable' && (
                <label className="form-field">
                  Embed URL
                  <input
                    className="input"
                    placeholder="https://..."
                    value={form.embedUrl}
                    onChange={(event) => setForm({ ...form, embedUrl: event.target.value })}
                    required
                  />
                </label>
              )}
              <textarea
                className="textarea"
                placeholder="Rules"
                value={form.rules}
                onChange={(event) => setForm({ ...form, rules: event.target.value })}
              />
              <textarea
                className="textarea"
                placeholder="Scoring Guidelines"
                value={form.scoreRules}
                onChange={(event) => setForm({ ...form, scoreRules: event.target.value })}
              />
              <input
                className="input"
                placeholder="Prize Pool (optional)"
                value={form.prizePool}
                onChange={(event) => setForm({ ...form, prizePool: event.target.value })}
              />
              <button type="submit" disabled={creating} className={`btn-primary tournaments-form__submit ${creating ? 'is-loading' : ''}`} aria-busy={creating}>
                {creating ? 'Creating…' : 'Create Tournament'}
              </button>
            </form>
          </div>
        )}

        <div className="toolbar tournaments-toolbar">
          <button className="btn-ghost" type="button" onClick={() => refetch()}>
            Refresh
          </button>
        </div>

        <ul className="game-list tournaments-list">
          {tournaments.map((tournament) => (
            <li key={tournament.id} className="game-item tournaments-item">
              <div className="item-header tournaments-item__header">
                <div className="title-row">
                  <strong>{tournament.name}</strong>
                  <span style={{ opacity: 0.7 }}>
                    {' '}
                    — {tournament.game} | {tournament.date?.slice(0, 10)} | {tournament.status}
                  </span>
                </div>
                <span className={`badge badge--${tournament.launchType.toLowerCase()}`}>
                  {tournament.launchType === 'Local' && 'LOCAL'}
                  {tournament.launchType === 'ExternalLink' && 'EXTERNAL'}
                  {tournament.launchType === 'Embeddable' && 'EMBED'}
                </span>
              </div>
              <div className="tournaments-item__players">
                Players:
                {' '}
                {tournament.players.map((player) => player.user.username).join(', ') || 'None'}
              </div>
              <div className="actions tournaments-actions">
                {(tournament.launchType === 'ExternalLink' && tournament.launchUrl) ||
                (tournament.launchType === 'Embeddable' && tournament.embedUrl) ? (
                  <button className="btn-primary" type="button" onClick={() => handleLaunch(tournament)}>
                    {tournament.launchType === 'ExternalLink' ? 'Open' : 'Play'}
                  </button>
                ) : null}
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => navigate(`/leaderboard?tournament=${tournament.id}`)}
                >
                  Leaderboard
                </button>
                {!myTournamentIds.includes(tournament.id) && (
                  <button className="btn-primary" type="button" onClick={() => handleJoin(tournament.id)}>
                    Join
                  </button>
                )}
                <button
                  className="btn-ghost"
                  type="button"
                  onClick={() => setExpandedId(expandedId === tournament.id ? null : tournament.id)}
                >
                  {expandedId === tournament.id ? 'Hide Details' : 'Show Details'}
                </button>
                {isAdmin && (
                  <div className="tournaments-admin-controls">
                    <button
                      className="btn-danger"
                      type="button"
                      onClick={() => deleteTournament({ variables: { id: tournament.id } })}
                    >
                      Delete
                    </button>
                    <div className="tournaments-admin-controls__assign">
                      <select
                        className="input"
                        value={assignPlayer[tournament.id] || ''}
                        onChange={(event) =>
                          setAssignPlayer((prev) => ({ ...prev, [tournament.id]: event.target.value }))
                        }
                      >
                        <option value="">Assign Player</option>
                        {players
                          .filter((player) => !tournament.players.some((assigned) => assigned.id === player.id))
                          .map((player) => (
                            <option key={player.id} value={player.id}>
                              {player.user.username}
                            </option>
                          ))}
                      </select>
                      <button
                        className="btn-primary"
                        type="button"
                        disabled={!assignPlayer[tournament.id]}
                        onClick={() => handleAssignPlayer(tournament.id)}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
              {expandedId === tournament.id && (
                <div className="details tournaments-details">
                  <div>
                    <strong>Game:</strong> {tournament.game}
                  </div>
                  {tournament.linkedGame && (
                    <div>
                      <strong>Linked Library Entry:</strong> {tournament.linkedGame.title}
                    </div>
                  )}
                  <div>
                    <strong>Date:</strong> {tournament.date?.slice(0, 10) || 'TBD'}
                  </div>
                  <div>
                    <strong>Status:</strong> {tournament.status}
                  </div>
                  {tournament.prizePool && (
                    <div>
                      <strong>Prize Pool:</strong> {tournament.prizePool}
                    </div>
                  )}
                  {tournament.rules && (
                    <div>
                      <strong>Rules:</strong>
                      <p>{tournament.rules}</p>
                    </div>
                  )}
                  {tournament.scoreRules && (
                    <div>
                      <strong>Score Submission:</strong>
                      <p>{tournament.scoreRules}</p>
                    </div>
                  )}
                  <div>
                    <strong>Players:</strong>{' '}
                    {tournament.players.map((player) => player.user.username).join(', ') || 'None'}
                  </div>
                  <div className="details-actions">
                    <button
                      className="btn-ghost"
                      type="button"
                      onClick={() => navigate(`/leaderboard?game=${tournament.linkedGame?.id || ''}`)}
                      disabled={!tournament.linkedGame}
                    >
                      View Game Ranking
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="card" style={{ marginTop: 24 }}>
          <h2>My Tournament History</h2>
          <ul>
            {tournaments
              .filter((tournament) => myTournamentIds.includes(tournament.id))
              .map((tournament) => (
                <li key={tournament.id}>
                  {tournament.name} | {tournament.game} | {tournament.date?.slice(0, 10)} | {tournament.status}
                </li>
              ))}
          </ul>
        </div>

        {activeLaunch && (
          <div className="modal-overlay" role="dialog" aria-modal="true">
            <div className="modal-card">
              <header className="modal-header">
                <h2>{activeLaunch.title}</h2>
                <button className="btn-ghost" type="button" onClick={() => setActiveLaunch(null)}>
                  Close
                </button>
              </header>
              <div className="modal-body">
                <iframe title={activeLaunch.title} src={activeLaunch.url} allowFullScreen />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
