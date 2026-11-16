import React from "react";
import { AbsoluteFill, interpolate, Sequence, staticFile } from "remotion";
import { Audio } from "@remotion/media";
import { T } from "./theme";
import { Backdrop, clamp } from "./lib";
import { Opening } from "./scenes/Opening";
import { Overview } from "./scenes/Overview";
import { Mobile } from "./scenes/Mobile";
import { Web } from "./scenes/Web";
import { Public } from "./scenes/Public";
import { Recap } from "./scenes/Recap";

export const DemoVideo: React.FC = () => (
  <AbsoluteFill style={{ background: "#08150d" }}>
    <Backdrop />
    <Audio src={staticFile("audio/music.mp3")} volume={(f) => 0.62 * interpolate(f, [T.end - 100, T.end - 5], [1, 0], clamp)} />
    <Sequence name="Opening" from={T.opening} durationInFrames={T.overview - T.opening}><Opening /></Sequence>
    <Sequence name="Overview" from={T.overview} durationInFrames={T.mobile - T.overview}><Overview /></Sequence>
    <Sequence name="Field app" from={T.mobile} durationInFrames={T.web - T.mobile}><Mobile /></Sequence>
    <Sequence name="Web portal" from={T.web} durationInFrames={T.pub - T.web}><Web /></Sequence>
    <Sequence name="Public site" from={T.pub} durationInFrames={T.recap - T.pub}><Public /></Sequence>
    <Sequence name="Recap" from={T.recap} durationInFrames={T.end - T.recap}><Recap /></Sequence>
  </AbsoluteFill>
);
