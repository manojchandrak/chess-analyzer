import { useEffect, useRef, useSyncExternalStore } from "react";
import { setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";
import { commentaryToSpeech, isSpeaking, sanToSpeech, say, speechSupported, stopSpeaking, subscribeSpeaking } from "../lib/speech";

/** Reads each newly shown move aloud while the moves speaker is on. While the commentary speaker is on
 * it reads the move and then the commentary ("D 5. Black stakes a claim in the center. A standard book move."). */
export function useSpokenMoves(ply: number, san: string | null, commentary: string | null) {
  const { speak, speakCommentary } = useBoardPrefs();
  const speaking = useSyncExternalStore(subscribeSpeaking, isSpeaking);
  const spoken = useRef(0);
  const latest = useRef({ san, commentary });

  useEffect(() => () => stopSpeaking(), []);

  // Keep the latest text in a ref for the effect below (effects run in the order they are declared).
  useEffect(() => {
    latest.current = { san, commentary };
  });

  // When a new move is shown, read it (and its commentary). Late changes to the same
  // move's commentary, such as the review finishing, are not read again.
  useEffect(() => {
    if ((!speak && !speakCommentary) || ply === spoken.current) return;
    spoken.current = ply;
    const parts: string[] = [];
    // The move is always read first; the commentary follows it when that speaker is on.
    if (latest.current.san) parts.push(sanToSpeech(latest.current.san));
    if (speakCommentary && latest.current.commentary) parts.push(commentaryToSpeech(latest.current.commentary));
    if (parts.length) say(parts.join(". "));
  }, [ply, speak, speakCommentary]);

  const toggleMoves = () => {
    if (speak) stopSpeaking();
    spoken.current = ply;
    setBoardPrefs({ speak: !speak });
  };

  const toggleCommentary = () => {
    if (speakCommentary) {
      stopSpeaking();
    } else if (commentary) {
      // Read the move that is on screen and its comment right away, as feedback.
      say([san ? sanToSpeech(san) : "", commentaryToSpeech(commentary)].filter(Boolean).join(". "));
    }
    spoken.current = ply;
    setBoardPrefs({ speakCommentary: !speakCommentary });
  };

  return { speak, speakCommentary, speaking, supported: speechSupported(), toggleMoves, toggleCommentary };
}
