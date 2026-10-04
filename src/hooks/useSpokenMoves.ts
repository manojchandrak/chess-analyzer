import { useEffect, useRef } from "react";
import { setBoardPrefs, useBoardPrefs } from "../lib/boardPrefs";
import { sanToSpeech, say, speechSupported, stopSpeaking } from "../lib/speech";

/** Reads each newly shown move aloud while the speaker is switched on (just the move). */
export function useSpokenMoves(ply: number, san: string | null) {
  const { speak } = useBoardPrefs();
  const spoken = useRef(0);

  useEffect(() => () => stopSpeaking(), []);

  useEffect(() => {
    if (!speak || ply === spoken.current) return;
    spoken.current = ply;
    if (san) say(sanToSpeech(san));
  }, [ply, speak, san]);

  const toggle = () => {
    if (speak) stopSpeaking();
    spoken.current = ply;
    setBoardPrefs({ speak: !speak });
  };

  return { speak, supported: speechSupported(), toggle };
}
