export type Anchor = { x: number; y: number }; // percent 0..100

export const OFFENSE_ANCHORS: Record<string, Anchor> = {
    QB: { x: 50, y: 60 },
    RB: { x: 50, y: 75 },
    FB: { x: 42, y: 72 },
    LT: { x: 38, y: 55 },
    LG: { x: 44, y: 55 },
    C:  { x: 50, y: 55 },
    RG: { x: 56, y: 55 },
    RT: { x: 62, y: 55 },
    TE: { x: 68, y: 62 },
    ZWR:{ x: 25, y: 68 },
    XWR:{ x: 75, y: 68 },
    SWR:{ x: 18, y: 58 },
};

export const DEFENSE_ANCHORS: Record<string, Anchor> = {
    FiveT: { x: 30, y: 40 },
    NT:   { x: 45, y: 40 },
    FourI:   { x: 55, y: 40 },
    EDGE: { x: 70, y: 40 },
    NickleBack:   { x: 50, y: 52 },
    WILL:  { x: 35, y: 52 },
    MIKE:  { x: 65, y: 52 },
    RCB:   { x: 20, y: 45 },
    LCB:   { x: 80, y: 45 },
    SS:    { x: 60, y: 30 },
    FS:    { x: 40, y: 30 },
};