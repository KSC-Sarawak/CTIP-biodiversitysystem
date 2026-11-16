import React from "react";
import { Composition } from "remotion";
import { DemoVideo } from "./Video";
import { FPS, T } from "./theme";

export const RemotionRoot: React.FC = () => (
  <Composition id="DemoVideo" component={DemoVideo} width={1920} height={1080} fps={FPS} durationInFrames={T.end} />
);
