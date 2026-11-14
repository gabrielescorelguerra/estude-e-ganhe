import type { Election } from '../../core/types';
import type { Game } from '../../state/useGame';
import { BrazilMap } from './BrazilMap';
import { MapPanel } from './MapPanel';

export function MapPage({ election, game }: { election: Election; game: Game }) {
  return (
    <div className="map-page">
      <BrazilMap election={election} game={game} />
      <MapPanel election={election} game={game} />
    </div>
  );
}
