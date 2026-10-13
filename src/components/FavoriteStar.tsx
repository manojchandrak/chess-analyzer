import type { GameRecord } from "../lib/games";
import { toggleFavorite, useFavoriteIds } from "../lib/history";
import { trackable } from "../lib/historyCore";

/** A star to mark a Lichess or Chess.com game as a favourite. Renders nothing for other games. */
export function FavoriteStar({ game, className = "" }: { game: GameRecord; className?: string }) {
  const favorites = useFavoriteIds();
  if (!trackable(game)) return null;
  const on = favorites.has(game.id);
  const label = on ? "Remove from favourites" : "Add to favourites";
  return (
    <button
      type="button"
      className={`star${on ? " star-on" : ""} ${className}`.trim()}
      aria-pressed={on}
      aria-label={label}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(game);
      }}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
