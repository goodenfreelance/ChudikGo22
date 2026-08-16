import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Creature, Food, GridTheme, Point, PendingPlacement } from '../types';
import { determineCreatureHeadAngle, isRandomMuscleTriggered, getRandomMuscleState, calculateKinematicBends, getCreatureElementWorldPositions, getBaseBounds, isInsideBase } from '../utils/creatures';
import { soundFx } from '../utils/audio';
import { ZoomIn, ZoomOut, Maximize2, RotateCw, RotateCcw, X, Crosshair, Compass, Gamepad2, ArrowUp, ChevronDown, ChevronUp, Zap, Shield } from 'lucide-react';

interface GridCanvasProps {
  creatures: Creature[];
  foods: Food[];
  selectedCreatureId: string | null;
  selectedCreatureName?: string | null;
  yourCreatureId?: string | null;
  controlledCreatureId?: string | null;
  focusTimestamp?: number;
  gridTheme: GridTheme;
  showNodes: boolean;
  pendingPlacement: PendingPlacement | null;
  worldRadius?: number;
  isSpacePressed?: boolean;
  isBraking?: boolean;
  isInvulnerable?: boolean;
  invulnerableSec?: number;
  onSetSpacePressed?: (pressed: boolean) => void;
  onToggleBrake?: () => void;
  onActivateInvulnerability?: () => void;
  onNodeClick: (x: number, y: number, isRightClick: boolean) => void;
  onSelectCreature: (id: string | null) => void;
  onPlaceCreature: (x: number, y: number, angleDeg: number) => void;
  onCancelPlacement: () => void;
  onChangePlacementAngle: (angleDeg: number) => void;
  onTurnPlayer?: (dir: 'left' | 'right') => void;
  onMovePlayerForward?: () => void;
}

const GridCanvasComponent: React.FC<GridCanvasProps> = ({
  creatures = [],
  foods = [],
  selectedCreatureId,
  selectedCreatureName,
  yourCreatureId,
  controlledCreatureId,
  focusTimestamp,
  gridTheme,
  showNodes,
  pendingPlacement,
  worldRadius = 50,
  isSpacePressed = false,
  isBraking = false,
  isInvulnerable = false,
  invulnerableSec = 0,
  onSetSpacePressed,
  onToggleBrake,
  onActivateInvulnerability,
  onNodeClick,
  onSelectCreature,
  onPlaceCreature,
  onCancelPlacement,
  onChangePlacementAngle,
  onTurnPlayer,
  onMovePlayerForward,
}) => {
  const halfWorld = worldRadius;
  const worldSize = worldRadius * 2;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Pan, zoom and placement state
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState<number>(1);
  const [hoverGridPos, setHoverGridPos] = useState<Point | null>(null);
  const [isPlayerHudCollapsed, setIsPlayerHudCollapsed] = useState<boolean>(false);
  const [isHintHidden, setIsHintHidden] = useState<boolean>(false);

  const [isCameraLocked, setIsCameraLocked] = useState<boolean>(true);
  const isDraggingRef = useRef<boolean>(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const lastOffsetRef = useRef<Point>({ x: 0, y: 0 });

  const CELL_SIZE = 40; // Base distance between grid nodes in pixels

  const activeOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const animStatesRef = useRef<Map<string, { displayX: number; displayY: number; displayAngle: number; muscleAnimStep: number }>>(new Map());
  const cameraOffsetRef = useRef<Point>({ x: 0, y: 0 });
  const lastRenderTimeRef = useRef<number>(performance.now());

  // Trail history and boost particles system
  interface BoostParticle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    maxLife: number;
    size: number;
    color: string;
    type: 'flame' | 'spark' | 'ink' | 'shockwave' | 'comic_text' | 'star' | 'heart' | 'confetti' | 'puff' | 'sweat' | 'rainbow' | 'sleep_z' | 'candy' | 'bonk_star' | 'donut';
    text?: string;
    rot?: number;
    vRot?: number;
  }

  const trailsRef = useRef<Map<string, Array<{ x: number; y: number; angleDeg: number; color: string; isDashing: boolean; time: number }>>>(new Map());
  const boostParticlesRef = useRef<BoostParticle[]>([]);
  const prevFoodEatenMapRef = useRef<Map<string, number>>(new Map());
  const prevDashingMapRef = useRef<Map<string, boolean>>(new Map());
  const prevBrakingMapRef = useRef<Map<string, boolean>>(new Map());
  const prevInvulnerableMapRef = useRef<Map<string, boolean>>(new Map());
  const prevCollisionsMapRef = useRef<Map<string, number>>(new Map());
  const prevElementsCountMapRef = useRef<Map<string, number>>(new Map());
  const prevCreatureIdsRef = useRef<Set<string>>(new Set());
  const cartoonCloudsRef = useRef<Array<{ x: number; y: number; scale: number; speed: number; opacity: number }>>([]);
  const cartoon2DecorsRef = useRef<Array<{ x: number; y: number; scale: number; speedX: number; speedY: number; emoji: string; rot: number; vRot: number; opacity: number }>>([]);
  const cartoon2ShootingStarsRef = useRef<Array<{ x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; len: number }>>([]);
  const cartoon2RipplesRef = useRef<Array<{ x: number; y: number; radius: number; maxRadius: number; color: string; alpha: number }>>([]);
  const smoothedHudYRef = useRef<Map<string, number>>(new Map());
  const isSpacePressedRef = useRef<boolean>(isSpacePressed);
  isSpacePressedRef.current = isSpacePressed;
  const isBrakingRef = useRef<boolean>(isBraking);
  isBrakingRef.current = isBraking;

  const creaturesRef = useRef(creatures);
  const foodsRef = useRef(foods);
  const zoomRef = useRef(zoom);
  const offsetRef = useRef(offset);
  const gridThemeRef = useRef(gridTheme);
  const showNodesRef = useRef(showNodes);
  const selectedCreatureIdRef = useRef(selectedCreatureId);
  const yourCreatureIdRef = useRef(yourCreatureId);
  const controlledCreatureIdRef = useRef(controlledCreatureId);
  const pendingPlacementRef = useRef(pendingPlacement);
  const isCameraLockedRef = useRef(isCameraLocked);
  const worldRadiusRef = useRef(worldRadius);

  // Synchronize refs synchronously on every render so requestAnimationFrame always has fresh data
  creaturesRef.current = creatures;
  foodsRef.current = foods;
  zoomRef.current = zoom;
  offsetRef.current = offset;
  gridThemeRef.current = gridTheme;
  showNodesRef.current = showNodes;
  selectedCreatureIdRef.current = selectedCreatureId;
  yourCreatureIdRef.current = yourCreatureId;
  controlledCreatureIdRef.current = controlledCreatureId;
  pendingPlacementRef.current = pendingPlacement;
  isCameraLockedRef.current = isCameraLocked;
  worldRadiusRef.current = worldRadius;

  // Center canvas on load or on active creature inside base
  useEffect(() => {
    if (canvasRef.current) {
      const { width, height } = canvasRef.current.getBoundingClientRect();
      const target = creatures.find((c) => c.id === selectedCreatureId) || creatures[0];
      if (target) {
        setOffset({
          x: width / 2 - target.x * CELL_SIZE * zoom,
          y: height / 2 - target.y * CELL_SIZE * zoom,
        });
      } else {
        const baseBounds = getBaseBounds(worldRadius);
        const centerX = (baseBounds.minX + baseBounds.maxX) / 2;
        const centerY = (baseBounds.minY + baseBounds.maxY) / 2;
        setOffset({
          x: width / 2 - centerX * CELL_SIZE * zoom,
          y: height / 2 - centerY * CELL_SIZE * zoom,
        });
      }
    }
  }, [selectedCreatureId]);

  const hoverGridPosRef = useRef<Point | null>(null);

  // Center view on selected creature whenever selection or focusTimestamp changes
  useEffect(() => {
    if (selectedCreatureId && canvasRef.current) {
      setIsCameraLocked(true);
      const target = (creaturesRef.current || []).find((c) => c.id === selectedCreatureId);
      if (target) {
        const animState = animStatesRef.current.get(selectedCreatureId);
        const tx = animState ? animState.displayX : target.x;
        const ty = animState ? animState.displayY : target.y;
        const width = canvasRef.current.width || canvasRef.current.clientWidth;
        const height = canvasRef.current.height || canvasRef.current.clientHeight;
        const newOffset = {
          x: width / 2 - tx * CELL_SIZE * zoom,
          y: height / 2 - ty * CELL_SIZE * zoom,
        };
        setOffset(newOffset);
        cameraOffsetRef.current = newOffset;
      }
    }
  }, [selectedCreatureId, focusTimestamp, zoom]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        const parent = canvasRef.current.parentElement;
        if (parent) {
          canvasRef.current.width = parent.clientWidth;
          canvasRef.current.height = parent.clientHeight;
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Keyboard shortcut 'R' for rotating placement orientation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!pendingPlacement) return;
      if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') {
        e.preventDefault();
        const nextAngle = (pendingPlacement.angleDeg + 45) % 360;
        onChangePlacementAngle(nextAngle);
      } else if (e.key === 'Escape') {
        onCancelPlacement();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingPlacement, onChangePlacementAngle, onCancelPlacement]);

  // Mouse to Grid coordinate conversion
  const screenToGrid = useCallback(
    (screenX: number, screenY: number): Point => {
      const curOffset = activeOffsetRef.current;
      const worldX = (screenX - curOffset.x) / zoom;
      const worldY = (screenY - curOffset.y) / zoom;
      return {
        x: Math.round(worldX / CELL_SIZE),
        y: Math.round(worldY / CELL_SIZE),
      };
    },
    [zoom]
  );

  // Grid to Screen coordinate conversion
  const gridToScreen = useCallback(
    (gridX: number, gridY: number): Point => {
      const curOffset = activeOffsetRef.current;
      return {
        x: curOffset.x + gridX * CELL_SIZE * zoom,
        y: curOffset.y + gridY * CELL_SIZE * zoom,
      };
    },
    [zoom]
  );

  // Mouse & Drag handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Right button (2), Middle button (1), or Shift+Left -> Drag/Pan view
    if (e.button === 1 || e.button === 2 || e.shiftKey) {
      isDraggingRef.current = true;
      setIsCameraLocked(false);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      lastOffsetRef.current = { ...activeOffsetRef.current };
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const gridPos = screenToGrid(mouseX, mouseY);
      hoverGridPosRef.current = gridPos;
      if (pendingPlacementRef.current) {
        setHoverGridPos(gridPos);
      }
    }

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setOffset({
        x: lastOffsetRef.current.x + dx,
        y: lastOffsetRef.current.y + dy,
      });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingRef.current) {
      const distMoved = Math.hypot(
        e.clientX - dragStartRef.current.x,
        e.clientY - dragStartRef.current.y
      );
      isDraggingRef.current = false;
      if (distMoved > 3) {
        return;
      }
    }

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const gridPos = screenToGrid(mouseX, mouseY);

    if (e.button === 0) {
      // If Placement Mode is active, place creature at this position
      if (pendingPlacement) {
        onPlaceCreature(gridPos.x, gridPos.y, pendingPlacement.angleDeg);
        return;
      }

      let bestMatch: { creatureId: string; distance: number } | null = null;

      for (const creature of creatures) {
        // Distance to creature center
        const centerDistGrid = Math.hypot(creature.x - gridPos.x, creature.y - gridPos.y);
        const centerDistScreen = Math.hypot(
          gridToScreen(creature.x, creature.y).x - mouseX,
          gridToScreen(creature.x, creature.y).y - mouseY
        );

        let minGridDist = centerDistGrid;

        // Also check distance to any element of the creature
        const elementPts = getCreatureElementWorldPositions(
          creature.x,
          creature.y,
          creature.angleDeg,
          creature.elements,
          creature.muscleStep,
          creature.forces
        );

        for (const pt of elementPts) {
          const ptDist = Math.hypot(pt.x - gridPos.x, pt.y - gridPos.y);
          if (ptDist < minGridDist) {
            minGridDist = ptDist;
          }
        }

        // Threshold: within 1.2 grid cells or 35px screen distance
        const maxScreenDistThreshold = Math.max(35, 1.2 * CELL_SIZE * zoom);
        const minScreenDist = minGridDist * CELL_SIZE * zoom;

        if (minScreenDist < maxScreenDistThreshold || centerDistScreen < 35) {
          const effectiveDist = Math.min(minScreenDist, centerDistScreen);
          if (!bestMatch || effectiveDist < bestMatch.distance) {
            bestMatch = { creatureId: creature.id, distance: effectiveDist };
          }
        }
      }

      if (bestMatch) {
        onSelectCreature(bestMatch.creatureId);
      }
    } else if (e.button === 2) {
      // Right click cancels placement / releases captured creature
      if (pendingPlacement) {
        onCancelPlacement();
        return;
      }

      // Right click deselects creature / releases camera focus
      if (selectedCreatureId) {
        onSelectCreature(null);
      }
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // Non-passive wheel event listener for zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

      setZoom((prevZoom) => {
        const newZoom = Math.max(0.3, Math.min(3.5, prevZoom * zoomFactor));
        const rect = canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setOffset((prevOffset) => ({
          x: mouseX - (mouseX - prevOffset.x) * (newZoom / prevZoom),
          y: mouseY - (mouseY - prevOffset.y) * (newZoom / prevZoom),
        }));

        return newZoom;
      });
    };

    canvas.addEventListener('wheel', handleWheelNative, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelNative);
    };
  }, []);

  // Reset View handler
  const handleResetView = () => {
    setZoom(1);
    if (canvasRef.current) {
      setOffset({
        x: canvasRef.current.width / 2,
        y: canvasRef.current.height / 2,
      });
    }
  };

  // Main Canvas Render Loop (Runs continuously at 60+ FPS via requestAnimationFrame without tearing down)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      const now = performance.now();
      const dt = lastRenderTimeRef.current ? Math.min((now - lastRenderTimeRef.current) / 1000, 0.1) : 0.016;
      lastRenderTimeRef.current = now;

      const currentZoom = zoomRef.current;
      const currentGridTheme = gridThemeRef.current;
      const currentSelectedId = selectedCreatureIdRef.current;
      const currentPendingPlacement = pendingPlacementRef.current;
      const currentShowNodes = showNodesRef.current;
      const currentIsCameraLocked = isCameraLockedRef.current;

      // Theme Colors
      const isCartoon1 = currentGridTheme === 'cartoon';
      const isCartoon2 = currentGridTheme === 'cartoon2';
      const isCartoonTheme = isCartoon1 || isCartoon2;
      const isGameTheme = currentGridTheme === 'game' || currentGridTheme === 'game-light';

      let bgColor = '#090d16';
      let gridLineColor = 'rgba(255, 255, 255, 0.1)';
      let nodeDotColor = 'rgba(255, 255, 255, 0.3)';
      let mainInkColor = '#f1f5f9';

      if (currentGridTheme === 'cartoon2') {
        bgColor = '#fae8ff';
        gridLineColor = 'rgba(236, 72, 153, 0.32)';
        nodeDotColor = '#ec4899';
        mainInkColor = '#0f172a';
      } else if (currentGridTheme === 'cartoon') {
        bgColor = '#bae6fd';
        gridLineColor = 'rgba(168, 85, 247, 0.18)';
        nodeDotColor = 'rgba(236, 72, 153, 0.55)';
        mainInkColor = '#0f172a';
      } else if (currentGridTheme === 'notebook') {
        bgColor = '#fafaf9';
        gridLineColor = 'rgba(59, 130, 246, 0.22)';
        nodeDotColor = 'rgba(30, 58, 138, 0.4)';
        mainInkColor = '#1e293b';
      } else if (currentGridTheme === 'blueprint') {
        bgColor = '#0f172a';
        gridLineColor = 'rgba(56, 189, 248, 0.25)';
        nodeDotColor = '#38bdf8';
        mainInkColor = '#e0f2fe';
      } else if (currentGridTheme === 'game') {
        bgColor = '#0a0d1d';
        gridLineColor = 'rgba(168, 85, 247, 0.22)';
        nodeDotColor = '#ec4899';
        mainInkColor = '#ffffff';
      } else if (currentGridTheme === 'game-light') {
        bgColor = '#f0fdf4';
        gridLineColor = 'rgba(236, 72, 153, 0.22)';
        nodeDotColor = '#8b5cf6';
        mainInkColor = '#0f172a';
      }

      // Background fill
      if (isCartoon2) {
        // Ultra-Vibrant Shifting Aurora Rainbow Sky for Cartoon 2!
        const skyShift = (Math.sin(now * 0.0008) + 1) * 0.5;
        const skyGrad = ctx.createLinearGradient(0, 0, width, height);
        skyGrad.addColorStop(0, '#f472b6'); // Hot bubblegum pink
        skyGrad.addColorStop(0.2 + skyShift * 0.05, '#c084fc'); // Electric purple
        skyGrad.addColorStop(0.45 + skyShift * 0.08, '#38bdf8'); // Sky cyan
        skyGrad.addColorStop(0.7 - skyShift * 0.05, '#4ade80'); // Candy neon green
        skyGrad.addColorStop(1, '#fde047'); // Sunny golden yellow
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);

        // Soft pastel wave sheen across screen
        ctx.save();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.beginPath();
        const waveY = (now * 0.06) % (height * 1.5) - height * 0.25;
        ctx.ellipse(width / 2, waveY, width * 0.8, 120, Math.sin(now * 0.001) * 0.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (isCartoon1) {
        const skyGrad = ctx.createLinearGradient(0, 0, 0, height);
        skyGrad.addColorStop(0, '#c7d2fe'); // Soft pastel violet sky
        skyGrad.addColorStop(0.35, '#bae6fd'); // Cheerful light azure
        skyGrad.addColorStop(0.7, '#fef08a'); // Warm sunny glow
        skyGrad.addColorStop(1, '#fbcfe8'); // Bubblegum cotton candy pink
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, width, height);
      } else {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, width, height);
      }

      const animMap = animStatesRef.current;
      const currentCreatures = creaturesRef.current || [];

      // Smoothly update display states for all creatures frame-by-frame
      currentCreatures.forEach((creature) => {
        let state = animMap.get(creature.id);
        if (!state) {
          state = {
            displayX: creature.x,
            displayY: creature.y,
            displayAngle: creature.angleDeg,
            muscleAnimStep: creature.muscleStep,
          };
          animMap.set(creature.id, state);
        } else {
          // Calculate target with toroidal wrap
          let targetX = creature.x;
          let targetY = creature.y;
          let targetAngle = creature.angleDeg;

          let dx = targetX - state.displayX;
          if (dx > halfWorld) targetX -= worldSize;
          if (dx < -halfWorld) targetX += worldSize;

          let dy = targetY - state.displayY;
          if (dy > halfWorld) targetY -= worldSize;
          if (dy < -halfWorld) targetY += worldSize;

          if (Math.abs(targetX - state.displayX) > halfWorld / 2) {
            state.displayX = creature.x;
            targetX = creature.x;
          }
          if (Math.abs(targetY - state.displayY) > halfWorld / 2) {
            state.displayY = creature.y;
            targetY = creature.y;
          }

          const lerpFactor = 1 - Math.exp(-22 * dt);

          state.displayX += (targetX - state.displayX) * lerpFactor;
          state.displayY += (targetY - state.displayY) * lerpFactor;

          if (state.displayX > halfWorld) state.displayX -= worldSize;
          if (state.displayX < -halfWorld) state.displayX += worldSize;
          if (state.displayY > halfWorld) state.displayY -= worldSize;
          if (state.displayY < -halfWorld) state.displayY += worldSize;

          let angleDiff = targetAngle - state.displayAngle;
          while (angleDiff > 180) angleDiff -= 360;
          while (angleDiff < -180) angleDiff += 360;

          state.displayAngle += angleDiff * lerpFactor;
          state.displayAngle = (state.displayAngle + 360) % 360;

          const distToTarget = Math.hypot(targetX - state.displayX, targetY - state.displayY);
          if (creature.state === 'moving' || creature.state === 'dashing' || distToTarget > 0.05) {
            state.muscleAnimStep += dt * 5.0;
          } else {
            state.muscleAnimStep = creature.muscleStep + Math.sin(now / 350) * 0.3;
          }
        }
      });

      // Compute effective camera offset with smooth lerp tracking
      let currentOffset = offsetRef.current;
      if (currentSelectedId && currentIsCameraLocked && !isDraggingRef.current) {
        const selectedAnimState = animMap.get(currentSelectedId);
        const targetCreature = currentCreatures.find((c) => c.id === currentSelectedId);
        if (selectedAnimState || targetCreature) {
          const targetX = selectedAnimState ? selectedAnimState.displayX : targetCreature!.x;
          const targetY = selectedAnimState ? selectedAnimState.displayY : targetCreature!.y;

          const targetCamX = width / 2 - targetX * CELL_SIZE * currentZoom;
          const targetCamY = height / 2 - targetY * CELL_SIZE * currentZoom;

          if (!cameraOffsetRef.current || (cameraOffsetRef.current.x === 0 && cameraOffsetRef.current.y === 0)) {
            cameraOffsetRef.current = { x: targetCamX, y: targetCamY };
          } else {
            const camLerp = 1 - Math.exp(-12 * dt);
            cameraOffsetRef.current.x += (targetCamX - cameraOffsetRef.current.x) * camLerp;
            cameraOffsetRef.current.y += (targetCamY - cameraOffsetRef.current.y) * camLerp;
          }
          currentOffset = cameraOffsetRef.current;
        }
      } else {
        cameraOffsetRef.current = { ...offsetRef.current };
        currentOffset = offsetRef.current;
      }
      activeOffsetRef.current = currentOffset;

      const scaledCell = CELL_SIZE * currentZoom;

      // Initialize background cartoon clouds if needed
      if (cartoonCloudsRef.current.length === 0) {
        for (let i = 0; i < 24; i++) {
          cartoonCloudsRef.current.push({
            x: (Math.random() - 0.5) * worldSize * 1.5,
            y: (Math.random() - 0.5) * worldSize * 1.5,
            scale: 0.8 + Math.random() * 1.1,
            speed: 0.4 + Math.random() * 1.0,
            opacity: 0.45 + Math.random() * 0.4,
          });
        }
      }

      // Initialize background cartoon2 floating fun decors
      if (cartoon2DecorsRef.current.length === 0) {
        const funEmojis = ['🍭', '🦄', '🌟', '🎈', '🍓', '🌈', '🧁', '🍩', '⚡', '💎', '🌸', '🍬', '✨', '🍉', '🎨'];
        for (let i = 0; i < 38; i++) {
          cartoon2DecorsRef.current.push({
            x: (Math.random() - 0.5) * worldSize * 1.6,
            y: (Math.random() - 0.5) * worldSize * 1.6,
            scale: 0.7 + Math.random() * 0.9,
            speedX: (Math.random() - 0.3) * 0.8,
            speedY: (Math.random() - 0.5) * 0.5,
            emoji: funEmojis[Math.floor(Math.random() * funEmojis.length)],
            rot: Math.random() * Math.PI * 2,
            vRot: (Math.random() - 0.5) * 1.5,
            opacity: 0.35 + Math.random() * 0.45,
          });
        }
      }

      // Render floating cartoon background elements
      if (isCartoon2) {
        // --- CARTOON 2: SHOOTING COMETS, FLOATING BUBBLES, RAINBOW ARCHES & EMOJI STICKERS ---
        ctx.save();

        // Spawn random shooting comets
        if (Math.random() < 0.035 && cartoon2ShootingStarsRef.current.length < 6) {
          const startX = (Math.random() - 0.5) * worldSize * 1.4;
          const startY = (Math.random() - 0.5) * worldSize * 1.4;
          const angle = Math.PI * 0.25 + (Math.random() - 0.5) * 0.3;
          const spd = 12 + Math.random() * 8;
          const starColors = ['#f472b6', '#38bdf8', '#facc15', '#a855f7', '#4ade80'];
          cartoon2ShootingStarsRef.current.push({
            x: startX,
            y: startY,
            vx: Math.cos(angle) * spd,
            vy: Math.sin(angle) * spd,
            life: 380,
            maxLife: 380,
            color: starColors[Math.floor(Math.random() * starColors.length)],
            len: 30 + Math.random() * 40,
          });
        }

        // Update & Render shooting comets
        for (let si = cartoon2ShootingStarsRef.current.length - 1; si >= 0; si--) {
          const comet = cartoon2ShootingStarsRef.current[si];
          comet.x += comet.vx * dt;
          comet.y += comet.vy * dt;
          comet.life -= dt * 1000;
          if (comet.life <= 0) {
            cartoon2ShootingStarsRef.current.splice(si, 1);
            continue;
          }

          const cx = currentOffset.x + comet.x * scaledCell;
          const cy = currentOffset.y + comet.y * scaledCell;
          const alpha = Math.min(1, comet.life / 200);

          ctx.save();
          ctx.translate(cx, cy);
          const cometAngle = Math.atan2(comet.vy, comet.vx);
          ctx.rotate(cometAngle);

          // Trail
          const cometGrad = ctx.createLinearGradient(-comet.len * currentZoom, 0, 0, 0);
          cometGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
          cometGrad.addColorStop(0.7, comet.color + 'aa');
          cometGrad.addColorStop(1, '#ffffff');

          ctx.strokeStyle = cometGrad;
          ctx.lineWidth = 3.5 * currentZoom;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(-comet.len * currentZoom, 0);
          ctx.lineTo(0, 0);
          ctx.stroke();

          // Star head
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(0, 0, 4 * currentZoom, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }

        // Floating jelly bubbles with emoji stickers
        cartoon2DecorsRef.current.forEach((item) => {
          item.x += item.speedX * dt;
          item.y += item.speedY * dt;
          item.rot += item.vRot * dt;

          if (item.x > halfWorld * 1.5) item.x = -halfWorld * 1.5;
          if (item.x < -halfWorld * 1.5) item.x = halfWorld * 1.5;
          if (item.y > halfWorld * 1.5) item.y = -halfWorld * 1.5;
          if (item.y < -halfWorld * 1.5) item.y = halfWorld * 1.5;

          const cx = currentOffset.x + item.x * scaledCell;
          const cy = currentOffset.y + item.y * scaledCell;

          if (cx > -100 && cx < width + 100 && cy > -100 && cy < height + 100) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(item.rot);
            const itemScale = item.scale * currentZoom;
            ctx.scale(itemScale, itemScale);
            ctx.globalAlpha = item.opacity;

            // Bouncy Jelly Soap Bubble
            const bubbleRad = 26;
            const bubbleGrad = ctx.createRadialGradient(-7, -7, 2, 0, 0, bubbleRad);
            bubbleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
            bubbleGrad.addColorStop(0.35, 'rgba(244, 114, 182, 0.35)');
            bubbleGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.4)');
            bubbleGrad.addColorStop(1, 'rgba(168, 85, 247, 0.55)');

            ctx.fillStyle = bubbleGrad;
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
            ctx.lineWidth = 2.8;
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRad, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // Specular Glint
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-9, -9, 5.5, 0, Math.PI * 2);
            ctx.fill();

            // Emoji inside / floating with bubble
            ctx.font = `${Math.round(22)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(item.emoji, 0, 2);

            ctx.restore();
          }
        });
        ctx.restore();
      } else if (isCartoon1) {
        // --- CARTOON 1: FLUFFY PASTEL CLOUDS ---
        ctx.save();
        cartoonCloudsRef.current.forEach((cloud) => {
          cloud.x += cloud.speed * dt;
          if (cloud.x > halfWorld * 1.4) cloud.x = -halfWorld * 1.4;

          const cx = currentOffset.x + cloud.x * scaledCell;
          const cy = currentOffset.y + cloud.y * scaledCell;

          if (cx > -200 && cx < width + 200 && cy > -200 && cy < height + 200) {
            ctx.save();
            ctx.translate(cx, cy);
            ctx.scale(cloud.scale * currentZoom, cloud.scale * currentZoom);
            ctx.globalAlpha = cloud.opacity;

            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = 'rgba(192, 132, 252, 0.35)';
            ctx.lineWidth = 3;

            ctx.beginPath();
            ctx.arc(0, 0, 26, 0, Math.PI * 2);
            ctx.arc(24, 4, 20, 0, Math.PI * 2);
            ctx.arc(-24, 6, 19, 0, Math.PI * 2);
            ctx.arc(12, -16, 17, 0, Math.PI * 2);
            ctx.arc(-12, -14, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            ctx.restore();
          }
        });
        ctx.restore();
      }

      // Render Floor Ripples in Cartoon 2
      if (isCartoon2 && cartoon2RipplesRef.current.length > 0) {
        ctx.save();
        for (let ri = cartoon2RipplesRef.current.length - 1; ri >= 0; ri--) {
          const ripple = cartoon2RipplesRef.current[ri];
          ripple.radius += dt * 35 * currentZoom;
          ripple.alpha -= dt * 1.8;
          if (ripple.alpha <= 0 || ripple.radius >= ripple.maxRadius) {
            cartoon2RipplesRef.current.splice(ri, 1);
            continue;
          }

          const rx = currentOffset.x + ripple.x * scaledCell;
          const ry = currentOffset.y + ripple.y * scaledCell;
          ctx.beginPath();
          ctx.arc(rx, ry, ripple.radius, 0, Math.PI * 2);
          ctx.strokeStyle = ripple.color;
          ctx.globalAlpha = Math.max(0, ripple.alpha);
          ctx.lineWidth = 2.5 * currentZoom;
          ctx.stroke();
        }
        ctx.restore();
      }

      // Render Grid Lines
      const startX = Math.floor((-currentOffset.x) / scaledCell) - 1;
      const endX = Math.ceil((width - currentOffset.x) / scaledCell) + 1;
      const startY = Math.floor((-currentOffset.y) / scaledCell) - 1;
      const endY = Math.ceil((height - currentOffset.y) / scaledCell) + 1;

      ctx.beginPath();
      ctx.strokeStyle = isCartoon2 ? 'rgba(255, 255, 255, 0.45)' : gridLineColor;
      ctx.lineWidth = isCartoon2
        ? Math.max(1.8, 2.4 * currentZoom)
        : isCartoon1
        ? Math.max(1.2, 1.8 * currentZoom)
        : Math.max(1, 1.2 * currentZoom);
      if (isCartoon2) {
        ctx.setLineDash([8 * currentZoom, 6 * currentZoom]);
      } else if (isCartoon1) {
        ctx.setLineDash([4 * currentZoom, 4 * currentZoom]);
      }

      for (let x = startX; x <= endX; x++) {
        const screenX = currentOffset.x + x * scaledCell;
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, height);
      }
      for (let y = startY; y <= endY; y++) {
        const screenY = currentOffset.y + y * scaledCell;
        ctx.moveTo(0, screenY);
        ctx.lineTo(width, screenY);
      }
      ctx.stroke();
      if (isCartoonTheme) {
        ctx.setLineDash([]);
      }

      // Render Grid Intersections / Nodes
      if (currentShowNodes) {
        if (isCartoon2) {
          // --- CARTOON 2: ROTATING 4-POINT RAINBOW SPARKLE STARS ON NODES ---
          const baseStarRad = Math.max(3.5, 5 * currentZoom);

          for (let x = startX; x <= endX; x++) {
            const screenX = currentOffset.x + x * scaledCell;
            for (let y = startY; y <= endY; y++) {
              const screenY = currentOffset.y + y * scaledCell;
              const starPulse = Math.sin(now * 0.004 + x * 0.5 + y * 0.5) * 0.35 + 1;
              const starRad = baseStarRad * starPulse;

              ctx.save();
              ctx.translate(screenX, screenY);
              ctx.rotate(now * 0.001 + (x + y) * 0.2);

              ctx.fillStyle = '#ffffff';
              ctx.strokeStyle = (x + y) % 2 === 0 ? '#f43f5e' : '#38bdf8';
              ctx.lineWidth = 1.4 * currentZoom;

              ctx.beginPath();
              ctx.moveTo(0, -starRad);
              ctx.quadraticCurveTo(0, 0, starRad, 0);
              ctx.quadraticCurveTo(0, 0, 0, starRad);
              ctx.quadraticCurveTo(0, 0, -starRad, 0);
              ctx.quadraticCurveTo(0, 0, 0, -starRad);
              ctx.fill();
              ctx.stroke();
              ctx.restore();
            }
          }
        } else {
          ctx.fillStyle = nodeDotColor;
          const dotRadius = isCartoon1 ? Math.max(2, 3.2 * currentZoom) : Math.max(1.5, 2.5 * currentZoom);
          ctx.beginPath();
          for (let x = startX; x <= endX; x++) {
            const screenX = currentOffset.x + x * scaledCell;
            for (let y = startY; y <= endY; y++) {
              const screenY = currentOffset.y + y * scaledCell;
              ctx.moveTo(screenX + dotRadius, screenY);
              ctx.arc(screenX, screenY, dotRadius, 0, Math.PI * 2);
            }
          }
          ctx.fill();
        }
      }

      // Render Field Arena Border Frame (Fast layered stroke)
      const arenaTopLeft = {
        x: currentOffset.x + (-halfWorld) * scaledCell,
        y: currentOffset.y + (-halfWorld) * scaledCell,
      };
      const arenaW = worldSize * scaledCell;
      const arenaH = worldSize * scaledCell;

      if (isCartoon2) {
        // Multi-colored rainbow candy striped cartoon border for Cartoon 2!
        ctx.save();
        ctx.strokeStyle = 'rgba(244, 114, 182, 0.45)';
        ctx.lineWidth = Math.max(12, 18 * currentZoom);
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);

        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = Math.max(4, 6 * currentZoom);
        ctx.setLineDash([14 * currentZoom, 10 * currentZoom]);
        ctx.lineDashOffset = (now / 40) % 24;
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);

        ctx.strokeStyle = '#fef08a';
        ctx.lineWidth = Math.max(2, 3 * currentZoom);
        ctx.setLineDash([7 * currentZoom, 17 * currentZoom]);
        ctx.lineDashOffset = (now / 40 + 12) % 24;
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);
        ctx.setLineDash([]);
        ctx.restore();
      } else if (isCartoon1) {
        ctx.save();
        ctx.strokeStyle = 'rgba(236, 72, 153, 0.35)';
        ctx.lineWidth = Math.max(10, 16 * currentZoom);
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);

        ctx.strokeStyle = '#ec4899';
        ctx.lineWidth = Math.max(3, 5 * currentZoom);
        ctx.setLineDash([12 * currentZoom, 8 * currentZoom]);
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);
        ctx.setLineDash([]);
        ctx.restore();
      } else {
        const arenaColor = isGameTheme ? '#ec4899' : (currentGridTheme === 'blueprint' ? '#38bdf8' : '#3b82f6');
        ctx.save();
        ctx.strokeStyle = arenaColor + '33';
        ctx.lineWidth = Math.max(6, 10 * currentZoom);
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);

        ctx.strokeStyle = arenaColor;
        ctx.lineWidth = Math.max(2, 3.5 * currentZoom);
        ctx.strokeRect(arenaTopLeft.x, arenaTopLeft.y, arenaW, arenaH);
        ctx.restore();
      }

      // Render Safe Zone (БАЗА / Safe Zone in bottom-right corner)
      const baseBounds = getBaseBounds(halfWorld);
      const baseTopLeft = {
        x: currentOffset.x + baseBounds.minX * scaledCell,
        y: currentOffset.y + baseBounds.minY * scaledCell,
      };
      const baseWidth = baseBounds.size * scaledCell;
      const baseHeight = baseBounds.size * scaledCell;

      ctx.save();
      // Floor tint
      ctx.fillStyle = isCartoon2
        ? 'rgba(253, 230, 138, 0.35)'
        : isCartoon1
        ? 'rgba(251, 207, 232, 0.35)'
        : isGameTheme
        ? 'rgba(16, 185, 129, 0.12)'
        : 'rgba(56, 189, 248, 0.08)';
      ctx.fillRect(baseTopLeft.x, baseTopLeft.y, baseWidth, baseHeight);

      // In Cartoon 2: Hanging Bunting Flags (Гирлянды веселых флажков 🚩)
      if (isCartoon2) {
        const flagColors = ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#4ade80', '#fb923c'];
        const numFlags = 12;
        const flagStep = baseWidth / numFlags;
        for (let fi = 0; fi < numFlags; fi++) {
          const fx = baseTopLeft.x + fi * flagStep + flagStep / 2;
          const fy = baseTopLeft.y;
          const flagSway = Math.sin(now * 0.005 + fi * 0.6) * 3 * currentZoom;

          ctx.beginPath();
          ctx.moveTo(fx - flagStep / 2, fy);
          ctx.lineTo(fx + flagStep / 2, fy);
          ctx.lineTo(fx + flagSway, fy + 14 * currentZoom);
          ctx.closePath();
          ctx.fillStyle = flagColors[fi % flagColors.length];
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2 * currentZoom;
          ctx.stroke();
        }
      }

      // Left, Bottom, Right protective perimeter borders (dashed)
      ctx.strokeStyle = isCartoon2
        ? 'rgba(244, 63, 94, 0.9)'
        : isCartoon1
        ? 'rgba(236, 72, 153, 0.85)'
        : isGameTheme
        ? 'rgba(16, 185, 129, 0.7)'
        : 'rgba(14, 165, 233, 0.7)';
      ctx.lineWidth = Math.max(2.5, 3.5 * currentZoom);
      ctx.setLineDash(isCartoonTheme ? [6 * currentZoom, 4 * currentZoom] : [8 * currentZoom, 5 * currentZoom]);
      ctx.beginPath();
      // Left side
      ctx.moveTo(baseTopLeft.x, baseTopLeft.y);
      ctx.lineTo(baseTopLeft.x, baseTopLeft.y + baseHeight);
      // Bottom side
      ctx.lineTo(baseTopLeft.x + baseWidth, baseTopLeft.y + baseHeight);
      // Right side
      ctx.lineTo(baseTopLeft.x + baseWidth, baseTopLeft.y);
      ctx.stroke();
      ctx.setLineDash([]);

      // =========================================================================
      // BRIGHT ONE-WAY TOP WALL (ЯРКАЯ СТЕНА: ВХОД СВЕРХУ ↓ / БЛОК СНИЗУ ⛔)
      // =========================================================================
      const wallY = baseTopLeft.y;
      const wallStartX = baseTopLeft.x;
      const wallEndX = baseTopLeft.x + baseWidth;
      const wallPulse = Math.sin(now / 130) * 0.25 + 0.75;
      const wallFastPulse = Math.sin(now / 70) * 0.15 + 0.85;

      // Layer 1: Wide Glow
      ctx.beginPath();
      ctx.moveTo(wallStartX, wallY);
      ctx.lineTo(wallEndX, wallY);
      ctx.strokeStyle = isCartoon2
        ? `rgba(250, 204, 21, ${0.65 * wallPulse})`
        : isCartoon1
        ? `rgba(244, 114, 182, ${0.55 * wallPulse})`
        : isGameTheme
        ? `rgba(6, 182, 212, ${0.45 * wallPulse})`
        : `rgba(56, 189, 248, ${0.45 * wallPulse})`;
      ctx.lineWidth = Math.max(12, 18 * currentZoom);
      ctx.lineCap = 'round';
      ctx.stroke();

      // Layer 2: Vibrant Barrier
      ctx.beginPath();
      ctx.moveTo(wallStartX, wallY);
      ctx.lineTo(wallEndX, wallY);
      ctx.strokeStyle = isCartoon2 ? '#f59e0b' : isCartoon1 ? '#ec4899' : isGameTheme ? '#06b6d4' : '#0ea5e9';
      ctx.lineWidth = Math.max(5, 7 * currentZoom * wallFastPulse);
      ctx.stroke();

      // Layer 3: Laser Core
      ctx.beginPath();
      ctx.moveTo(wallStartX, wallY);
      ctx.lineTo(wallEndX, wallY);
      ctx.strokeStyle = isCartoonTheme ? '#fef08a' : '#a5f3fc';
      ctx.lineWidth = Math.max(2.5, 3.5 * currentZoom);
      ctx.stroke();

      // Layer 4: Center Filament
      ctx.beginPath();
      ctx.moveTo(wallStartX, wallY);
      ctx.lineTo(wallEndX, wallY);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1.2, 1.8 * currentZoom);
      ctx.stroke();

      // Animated Downward Directional Flow Chevrons
      const arrowStep = Math.max(24, 32 * currentZoom);
      const arrowCount = Math.floor(baseWidth / arrowStep);
      const flowCycle = ((now / 20) % 16) / 16;

      for (let ai = 1; ai < arrowCount; ai++) {
        const arrowX = wallStartX + ai * arrowStep;
        const arrowYOffset = flowCycle * 14 * currentZoom;
        const arrowY = wallY + arrowYOffset;
        const arrowAlpha = Math.sin(flowCycle * Math.PI) * 0.85;

        ctx.save();
        ctx.translate(arrowX, arrowY);
        ctx.fillStyle = isCartoon2
          ? `rgba(245, 158, 11, ${arrowAlpha})`
          : isCartoon1
          ? `rgba(236, 72, 153, ${arrowAlpha})`
          : isGameTheme
          ? `rgba(34, 211, 238, ${arrowAlpha})`
          : `rgba(56, 189, 248, ${arrowAlpha})`;
        ctx.strokeStyle = `rgba(255, 255, 255, ${arrowAlpha * 0.9})`;
        ctx.lineWidth = Math.max(1, 1.5 * currentZoom);

        const aw = 4 * currentZoom;
        const ah = 4 * currentZoom;
        ctx.beginPath();
        ctx.moveTo(-aw, -ah);
        ctx.lineTo(0, ah);
        ctx.lineTo(aw, -ah);
        ctx.stroke();
        ctx.restore();
      }

      // Energy Emitter Pylons at wall ends
      [wallStartX, wallEndX].forEach((pylonX) => {
        ctx.beginPath();
        ctx.arc(pylonX, wallY, (8 + wallPulse * 3) * currentZoom, 0, Math.PI * 2);
        ctx.fillStyle = isCartoon2 ? 'rgba(245, 158, 11, 0.45)' : isCartoon1 ? 'rgba(236, 72, 153, 0.4)' : 'rgba(6, 182, 212, 0.35)';
        ctx.fill();

        ctx.beginPath();
        const pSize = 5 * currentZoom;
        ctx.moveTo(pylonX, wallY - pSize);
        ctx.lineTo(pylonX + pSize, wallY);
        ctx.lineTo(pylonX, wallY + pSize);
        ctx.lineTo(pylonX - pSize, wallY);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.strokeStyle = isCartoon2 ? '#f59e0b' : isCartoon1 ? '#ec4899' : '#06b6d4';
        ctx.lineWidth = 1.8 * currentZoom;
        ctx.stroke();
      });

      // Wall Badge / Title Tag in center
      const badgeCenterX = wallStartX + baseWidth / 2;
      const badgeCenterY = wallY - 14 * currentZoom;
      const badgeText = isCartoon2
        ? '🎉 ПАТИ ДОМИК (ВХОД СВЕРХУ ↓) 🎈'
        : isCartoon1
        ? '🏰 ДОМИК (ВХОД СВЕРХУ ↓) 🌈'
        : '⚡ ВХОД СВЕРХУ ↓ (БЛОК ИЗНУТРИ ⛔)';
      ctx.font = `bold ${Math.max(10, 11.5 * currentZoom)}px system-ui, sans-serif`;
      const textMetrics = ctx.measureText(badgeText);
      const textW = textMetrics.width;
      const padX = 8 * currentZoom;
      const padY = 3.5 * currentZoom;

      // Badge background pill
      ctx.fillStyle = isCartoonTheme ? 'rgba(255, 255, 255, 0.95)' : isGameTheme ? 'rgba(8, 51, 68, 0.92)' : 'rgba(15, 23, 42, 0.92)';
      ctx.strokeStyle = isCartoon2 ? '#f59e0b' : isCartoon1 ? '#ec4899' : '#06b6d4';
      ctx.lineWidth = Math.max(1.5, 2 * currentZoom);
      ctx.beginPath();
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(badgeCenterX - textW / 2 - padX, badgeCenterY - 7 * currentZoom - padY, textW + padX * 2, 14 * currentZoom + padY * 2, 8 * currentZoom);
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(badgeCenterX - textW / 2 - padX, badgeCenterY - 7 * currentZoom - padY, textW + padX * 2, 14 * currentZoom + padY * 2);
        ctx.strokeRect(badgeCenterX - textW / 2 - padX, badgeCenterY - 7 * currentZoom - padY, textW + padX * 2, 14 * currentZoom + padY * 2);
      }

      ctx.fillStyle = isCartoon2 ? '#b45309' : isCartoon1 ? '#be185d' : '#22d3ee';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, badgeCenterX, badgeCenterY);

      // Base Zone Info Label inside the base
      const baseLabel = isCartoon2
        ? '🎈 ПАТИ ДОМИК / CANDY KINGDOM 🎉🍰'
        : isCartoon1
        ? '🏰 ДОМИК / SAFE ZONE 🌈✨'
        : '🛡️ БАЗА / SAFE ZONE';
      const subLabel = isCartoon2
        ? 'Веселый домик • 100% Защита • Депозит сладостей в Банк 🏦'
        : isCartoon1
        ? 'Уютный домик • Безопасность 100% • Вкусная еда в Банк'
        : 'Иммунитет • Вход сверху через яркую стену • Депозит в Банк';
      ctx.font = `bold ${Math.max(12, 14 * currentZoom)}px system-ui, sans-serif`;
      ctx.fillStyle = isCartoon2 ? '#b45309' : isCartoon1 ? '#be185d' : isGameTheme ? '#34d399' : '#38bdf8';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(baseLabel, baseTopLeft.x + 12 * currentZoom, baseTopLeft.y + 14 * currentZoom);

      ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px monospace`;
      ctx.fillStyle = isCartoon2 ? '#78350f' : isCartoon1 ? '#831843' : isGameTheme ? 'rgba(167, 243, 208, 0.85)' : 'rgba(186, 230, 253, 0.85)';
      ctx.fillText(subLabel, baseTopLeft.x + 12 * currentZoom, baseTopLeft.y + 34 * currentZoom);
      ctx.restore();

      // Render Food on nodes
      const nowTime = Date.now();
      const currentFoods = foodsRef.current || [];
      currentFoods.forEach((food) => {
        const pos = {
          x: currentOffset.x + food.x * scaledCell,
          y: currentOffset.y + food.y * scaledCell,
        };
        ctx.save();
        ctx.translate(pos.x, pos.y);

        const pulse = Math.sin(nowTime / 200 + food.x + food.y) * 2;
        const foodRadius = (6 + pulse) * currentZoom;

        if (isCartoon2) {
          // =========================================================================
          // CARTOON 2 EXCLUSIVE: GLAZED DONUTS 🍩, SWIRL 3D LOLLIPOPS 🍭, SUPERSTAR KINGS 👑⭐
          // =========================================================================
          if (food.type === 'golden') {
            // Golden Superstar King 🌟 with floating crown & sunburst rays
            const starR = (9 + pulse * 1.4) * currentZoom;

            // Pulsing sunburst god-rays
            ctx.save();
            ctx.rotate(nowTime * 0.001);
            for (let r = 0; r < 8; r++) {
              ctx.rotate(Math.PI / 4);
              ctx.fillStyle = 'rgba(253, 224, 71, 0.25)';
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.lineTo(-4 * currentZoom, starR * 2.2);
              ctx.lineTo(4 * currentZoom, starR * 2.2);
              ctx.closePath();
              ctx.fill();
            }
            ctx.restore();

            // Golden star body
            ctx.beginPath();
            for (let s = 0; s < 5; s++) {
              const outerA = (s * Math.PI * 2) / 5 - Math.PI / 2;
              const innerA = outerA + Math.PI / 5;
              if (s === 0) ctx.moveTo(Math.cos(outerA) * starR, Math.sin(outerA) * starR);
              else ctx.lineTo(Math.cos(outerA) * starR, Math.sin(outerA) * starR);
              ctx.lineTo(Math.cos(innerA) * (starR * 0.5), Math.sin(innerA) * (starR * 0.5));
            }
            ctx.closePath();
            ctx.fillStyle = '#facc15';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.4 * currentZoom;
            ctx.stroke();

            // Shiny Golden King Crown 👑 on top
            const crownY = -starR * 0.9;
            ctx.beginPath();
            ctx.moveTo(-5 * currentZoom, crownY);
            ctx.lineTo(-6 * currentZoom, crownY - 6 * currentZoom);
            ctx.lineTo(-2 * currentZoom, crownY - 3 * currentZoom);
            ctx.lineTo(0, crownY - 7 * currentZoom);
            ctx.lineTo(2 * currentZoom, crownY - 3 * currentZoom);
            ctx.lineTo(6 * currentZoom, crownY - 6 * currentZoom);
            ctx.lineTo(5 * currentZoom, crownY);
            ctx.closePath();
            ctx.fillStyle = '#f59e0b';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.2 * currentZoom;
            ctx.stroke();

            // Red ruby gems on crown points
            [-6, 0, 6].forEach((cxOffset, idx) => {
              ctx.fillStyle = '#ef4444';
              ctx.beginPath();
              ctx.arc(cxOffset * currentZoom, crownY - (idx === 1 ? 7 : 6) * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
              ctx.fill();
            });

            // Sparkling cartoon eyes on star
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(-2.8 * currentZoom, -0.5 * currentZoom, 1.4 * currentZoom, 0, Math.PI * 2);
            ctx.arc(2.8 * currentZoom, -0.5 * currentZoom, 1.4 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Eye glints
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(-3.2 * currentZoom, -1 * currentZoom, 0.6 * currentZoom, 0, Math.PI * 2);
            ctx.arc(2.4 * currentZoom, -1 * currentZoom, 0.6 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Cute smiling open mouth
            ctx.beginPath();
            ctx.arc(0, 1 * currentZoom, 2.2 * currentZoom, 0, Math.PI);
            ctx.fillStyle = '#ef4444';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1 * currentZoom;
            ctx.stroke();
          } else if (food.type === 'super') {
            // Swirling 3D Rainbow Lollipop 🍭 with rotating candy spiral and orbiting stars
            const popR = (9 + pulse) * currentZoom;

            // Orbiting sparkling mini star
            const orbAngle = nowTime * 0.003;
            const orbX = Math.cos(orbAngle) * (popR * 1.5);
            const orbY = Math.sin(orbAngle) * (popR * 1.5);
            ctx.fillStyle = '#fde047';
            ctx.beginPath();
            ctx.arc(orbX, orbY, 2.2 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Stick
            ctx.beginPath();
            ctx.moveTo(0, popR * 0.4);
            ctx.lineTo(0, popR * 1.8);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 3.2 * currentZoom;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1 * currentZoom;
            ctx.stroke();

            // Candy disc
            ctx.beginPath();
            ctx.arc(0, 0, popR, 0, Math.PI * 2);
            ctx.fillStyle = '#a855f7';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.4 * currentZoom;
            ctx.stroke();

            // Rotating colorful pinwheel / swirl bands
            ctx.save();
            ctx.rotate(nowTime * 0.003);
            const swirlColors = ['#f43f5e', '#38bdf8', '#facc15', '#4ade80'];
            for (let b = 0; b < 4; b++) {
              ctx.rotate(Math.PI / 2);
              ctx.beginPath();
              ctx.moveTo(0, 0);
              ctx.arc(0, 0, popR * 0.88, 0, Math.PI * 0.28);
              ctx.closePath();
              ctx.fillStyle = swirlColors[b];
              ctx.fill();
            }
            ctx.restore();

            // White glossy 3D shine crescent
            ctx.beginPath();
            ctx.arc(-popR * 0.35, -popR * 0.35, popR * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
          } else {
            // Bouncing Glazed Donut 🍩 with colorful sprinkles & blinking cartoon smile!
            const hop = Math.abs(Math.sin(nowTime / 180 + food.x + food.y)) * 2.5 * currentZoom;
            const donutR = (8 + pulse * 0.8) * currentZoom;
            const donutHoleR = donutR * 0.38;

            ctx.translate(0, -hop);

            // Donut Golden Pastry Dough
            ctx.beginPath();
            ctx.arc(0, 0, donutR, 0, Math.PI * 2);
            ctx.fillStyle = '#d97706';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.2 * currentZoom;
            ctx.stroke();

            // Frosting (Glossy Bubblegum Pink Glaze)
            ctx.beginPath();
            ctx.arc(0, -donutR * 0.08, donutR * 0.9, 0, Math.PI * 2);
            ctx.fillStyle = '#f472b6';
            ctx.fill();

            // Donut center hole
            ctx.beginPath();
            ctx.arc(0, 0, donutHoleR, 0, Math.PI * 2);
            ctx.fillStyle = isCartoon2 ? '#fae8ff' : '#ffffff';
            ctx.fill();
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1.8 * currentZoom;
            ctx.stroke();

            // Multicolored sprinkles on glaze
            const sprinkleColors = ['#fde047', '#38bdf8', '#4ade80', '#ffffff', '#a855f7'];
            const sprinkleOffsets = [
              [-5, -4, 0.2],
              [4, -5, -0.4],
              [-4, 4, 0.6],
              [5, 3, -0.3],
              [0, -6, 0.8],
            ];
            sprinkleOffsets.forEach(([sx, sy, sRot], sIdx) => {
              ctx.save();
              ctx.translate(sx * currentZoom * 0.8, sy * currentZoom * 0.8);
              ctx.rotate(sRot);
              ctx.fillStyle = sprinkleColors[sIdx % sprinkleColors.length];
              ctx.fillRect(-1.5 * currentZoom, -0.8 * currentZoom, 3 * currentZoom, 1.6 * currentZoom);
              ctx.restore();
            });

            // Cute happy cartoon face on donut
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            ctx.arc(-3.2 * currentZoom, -1 * currentZoom, 1.1 * currentZoom, 0, Math.PI * 2);
            ctx.arc(3.2 * currentZoom, -1 * currentZoom, 1.1 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Blush cheeks
            ctx.fillStyle = '#fda4af';
            ctx.beginPath();
            ctx.arc(-4.5 * currentZoom, 0.5 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.arc(4.5 * currentZoom, 0.5 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Smile
            ctx.beginPath();
            ctx.arc(0, 0.2 * currentZoom, 1.8 * currentZoom, 0, Math.PI);
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 1 * currentZoom;
            ctx.stroke();
          }
        } else if (isCartoon1) {
          // --- CARTOON 1 CUTE FOOD (Strawberries 🍓, Shiny Stars ⭐, Swirl Lollipops 🍭) ---
          if (food.type === 'golden') {
            // Golden Shining Smiling Star ⭐
            const starR = (8 + pulse * 1.2) * currentZoom;
            // Golden halo pulse
            ctx.fillStyle = 'rgba(250, 204, 21, 0.35)';
            ctx.beginPath();
            ctx.arc(0, 0, starR * 1.8, 0, Math.PI * 2);
            ctx.fill();

            // Star shape
            ctx.beginPath();
            for (let s = 0; s < 5; s++) {
              const outerA = (s * Math.PI * 2) / 5 - Math.PI / 2;
              const innerA = outerA + Math.PI / 5;
              if (s === 0) ctx.moveTo(Math.cos(outerA) * starR, Math.sin(outerA) * starR);
              else ctx.lineTo(Math.cos(outerA) * starR, Math.sin(outerA) * starR);
              ctx.lineTo(Math.cos(innerA) * (starR * 0.48), Math.sin(innerA) * (starR * 0.48));
            }
            ctx.closePath();
            ctx.fillStyle = '#facc15';
            ctx.fill();
            ctx.strokeStyle = '#854d0e';
            ctx.lineWidth = 1.8 * currentZoom;
            ctx.stroke();

            // Cute smiling cartoon face on star
            ctx.fillStyle = '#713f12';
            ctx.beginPath();
            ctx.arc(-2.5 * currentZoom, -1 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.arc(2.5 * currentZoom, -1 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Smile
            ctx.beginPath();
            ctx.arc(0, 0.5 * currentZoom, 2 * currentZoom, 0, Math.PI);
            ctx.strokeStyle = '#713f12';
            ctx.lineWidth = 1 * currentZoom;
            ctx.stroke();
          } else if (food.type === 'super') {
            // Swirly Candy Lollipop 🍭
            const popR = (8 + pulse) * currentZoom;
            // Stick
            ctx.beginPath();
            ctx.moveTo(0, popR * 0.5);
            ctx.lineTo(0, popR * 1.6);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2.5 * currentZoom;
            ctx.lineCap = 'round';
            ctx.stroke();
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 0.8 * currentZoom;
            ctx.stroke();

            // Candy disc
            ctx.beginPath();
            ctx.arc(0, 0, popR, 0, Math.PI * 2);
            ctx.fillStyle = '#ec4899';
            ctx.fill();
            ctx.strokeStyle = '#831843';
            ctx.lineWidth = 1.8 * currentZoom;
            ctx.stroke();

            // Swirl spiral
            ctx.beginPath();
            const rot = (nowTime / 400) % (Math.PI * 2);
            ctx.arc(0, 0, popR * 0.65, rot, rot + Math.PI);
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2.2 * currentZoom;
            ctx.stroke();

            // Specular shine
            ctx.beginPath();
            ctx.arc(-popR * 0.35, -popR * 0.35, popR * 0.28, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
            ctx.fill();
          } else {
            // Glossy Cartoon Strawberry / Cherry 🍓
            const berryR = (7 + pulse) * currentZoom;
            // Green leaf on top
            ctx.beginPath();
            ctx.ellipse(0, -berryR * 1.1, 4 * currentZoom, 2 * currentZoom, 0, 0, Math.PI * 2);
            ctx.fillStyle = '#22c55e';
            ctx.fill();
            ctx.strokeStyle = '#15803d';
            ctx.lineWidth = 1 * currentZoom;
            ctx.stroke();

            // Strawberry Body
            ctx.beginPath();
            ctx.arc(0, 0, berryR, 0, Math.PI * 2);
            ctx.fillStyle = '#f43f5e';
            ctx.fill();
            ctx.strokeStyle = '#881337';
            ctx.lineWidth = 1.8 * currentZoom;
            ctx.stroke();

            // Cute smiling cartoon face & rosy cheeks
            ctx.fillStyle = '#881337';
            ctx.beginPath();
            ctx.arc(-2 * currentZoom, -1 * currentZoom, 1 * currentZoom, 0, Math.PI * 2);
            ctx.arc(2 * currentZoom, -1 * currentZoom, 1 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Blush cheeks
            ctx.fillStyle = 'rgba(254, 205, 211, 0.8)';
            ctx.beginPath();
            ctx.arc(-3.5 * currentZoom, 1 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.arc(3.5 * currentZoom, 1 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
            ctx.fill();

            // Smile
            ctx.beginPath();
            ctx.arc(0, 0.5 * currentZoom, 1.6 * currentZoom, 0, Math.PI);
            ctx.strokeStyle = '#881337';
            ctx.lineWidth = 0.9 * currentZoom;
            ctx.stroke();

            // White gloss highlight
            ctx.beginPath();
            ctx.arc(-berryR * 0.35, -berryR * 0.35, berryR * 0.3, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            ctx.fill();
          }
        } else if (isGameTheme) {
          const glowR = foodRadius * 2.2;
          const mainColor = food.type === 'golden' ? '#facc15' : (food.type === 'super' ? '#ec4899' : '#10b981');

          // Glowing aura
          ctx.fillStyle = mainColor + '44';
          ctx.beginPath();
          ctx.arc(0, 0, glowR, 0, Math.PI * 2);
          ctx.fill();

          // Shiny 3D candy sphere
          ctx.beginPath();
          ctx.arc(0, 0, foodRadius, 0, Math.PI * 2);
          ctx.fillStyle = mainColor;
          ctx.fill();

          // Shadow overlay
          ctx.beginPath();
          ctx.arc(0, foodRadius * 0.15, foodRadius * 0.85, 0, Math.PI);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
          ctx.fill();

          // White specular highlight
          ctx.beginPath();
          ctx.arc(-foodRadius * 0.3, -foodRadius * 0.3, foodRadius * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.fill();
        } else {
          if (food.type === 'golden') {
            ctx.fillStyle = 'rgba(234, 179, 8, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, foodRadius * 1.6, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#eab308';
          } else if (food.type === 'super') {
            ctx.fillStyle = 'rgba(168, 85, 247, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, foodRadius * 1.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#a855f7';
          } else {
            ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
            ctx.beginPath();
            ctx.arc(0, 0, foodRadius * 1.4, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#10b981';
          }

          ctx.beginPath();
          ctx.arc(0, 0, foodRadius, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = mainInkColor;
          ctx.lineWidth = 1.5 * currentZoom;
          ctx.stroke();
        }

        ctx.restore();
      });

      // --- TRAIL & BOOST PARTICLES SYSTEM (Phase: Wake Trail & Boost Acceleration) ---
      const currentSpace = isSpacePressedRef.current;
      const playerCreatureId = controlledCreatureIdRef.current || yourCreatureIdRef.current || 'c-1';

      // 1. Update trail history points & spawn boost particles
      currentCreatures.forEach((creature) => {
        const animState = animMap.get(creature.id);
        const currentX = animState ? animState.displayX : creature.x;
        const currentY = animState ? animState.displayY : creature.y;
        const currentAngle = animState ? animState.displayAngle : creature.angleDeg;
        const isPlayerCreature = creature.id === playerCreatureId;
        const canDash = (creature.foodEaten ?? 0) > 0;
        const isDashing = (creature.state === 'dashing' || (creature as any).isDashing || (isPlayerCreature && currentSpace)) && canDash;

        // Food eaten event detection & comic popups
        const prevFood = prevFoodEatenMapRef.current.get(creature.id);
        const currentFoodCount = creature.foodEaten ?? 0;
        if (prevFood !== undefined && currentFoodCount > prevFood) {
          let chosenText = 'YUM! 😋';
          if (isCartoon2) {
            const c2Texts = ['SUPER YUM! 🍩', 'SUGAR RUSH! ⚡', 'CANDY POWER! 🍭', 'MEGA CHOMP! 🍰', 'YAY! 🌟', 'PARTY TIME! 🎉', 'DELICIOUS! 🍓', 'BOOM NOM! 💥'];
            chosenText = c2Texts[Math.floor(Math.random() * c2Texts.length)];
          } else {
            const comicTexts = ['YUM! 😋', 'NOM NOM! 🍎', 'CRUNCH! ⭐', 'SWEET! 💖', 'TASTY! ✨', 'CHOMP! 🍓'];
            chosenText = comicTexts[Math.floor(Math.random() * comicTexts.length)];
          }

          // Spawn comic text popup!
          boostParticlesRef.current.push({
            x: currentX,
            y: currentY - 0.6,
            vx: (Math.random() - 0.5) * 0.4,
            vy: -1.5,
            life: isCartoon2 ? 750 : 650,
            maxLife: isCartoon2 ? 750 : 650,
            size: isCartoon2 ? 18 : 16,
            color: isCartoon2 ? '#fde047' : '#facc15',
            type: 'comic_text',
            text: chosenText,
          });

          // In Cartoon 2: spawn floor ripples
          if (isCartoon2) {
            cartoon2RipplesRef.current.push({
              x: currentX,
              y: currentY,
              radius: 6 * currentZoom,
              maxRadius: 28 * currentZoom,
              color: '#ec4899',
              alpha: 0.9,
            });
          }

          // Confetti, candies, donuts and stars explosion
          const confColors = ['#f43f5e', '#a855f7', '#3b82f6', '#10b981', '#facc15', '#ec4899', '#38bdf8', '#fb923c'];
          const numConfetti = isCartoon2 ? 24 : isCartoon1 ? 16 : 8;
          for (let ci = 0; ci < numConfetti; ci++) {
            const ang = (ci / numConfetti) * Math.PI * 2 + Math.random() * 0.4;
            const spd = 1.4 + Math.random() * 3.2;
            let pType: BoostParticle['type'] = 'spark';
            if (isCartoon2) {
              const dice = Math.random();
              pType = dice < 0.3 ? 'candy' : dice < 0.55 ? 'donut' : dice < 0.8 ? 'star' : 'confetti';
            } else if (isCartoon1) {
              pType = Math.random() > 0.4 ? 'star' : 'confetti';
            }

            boostParticlesRef.current.push({
              x: currentX,
              y: currentY,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd - 1.0,
              life: 500 + Math.random() * 350,
              maxLife: 700,
              size: isCartoon2 ? 7 + Math.random() * 6 : isCartoon1 ? 5 + Math.random() * 4 : 3 + Math.random() * 3,
              color: confColors[ci % confColors.length],
              type: pType,
              rot: Math.random() * Math.PI * 2,
              vRot: (Math.random() - 0.5) * 14,
            });
          }

          if (isCartoon2) {
            soundFx.playCartoon2SuperEat();
          } else if (isCartoon1) {
            soundFx.playCartoonChomp();
          }
        }
        prevFoodEatenMapRef.current.set(creature.id, currentFoodCount);

        // Cannibalism event detection (segment bitten off)
        const prevElemCount = prevElementsCountMapRef.current.get(creature.id);
        const curElemCount = creature.elements.length;
        if (prevElemCount !== undefined && curElemCount < prevElemCount) {
          // Play beautiful cannibalism audio based on active theme
          soundFx.playCannibalism(false);

          let biteText = isCartoon2
            ? ['ХРУМ! 🍖', 'ОЙ-ЁЙ! 🩸', 'КУСЬ! 😋', 'НЁМ-НЁМ! 💥'][Math.floor(Math.random() * 4)]
            : isCartoon1
            ? ['КУСЬ! 🥩', 'ХРУСЬ! 💥', 'АМ! 🍽️', 'ОЙ! 🩸'][Math.floor(Math.random() * 4)]
            : 'УКУС! 💥';

          boostParticlesRef.current.push({
            x: currentX,
            y: currentY - 0.7,
            vx: (Math.random() - 0.5) * 0.6,
            vy: -1.8,
            life: isCartoon2 ? 800 : 700,
            maxLife: 800,
            size: isCartoon2 ? 21 : 18,
            color: '#ef4444',
            type: 'comic_text',
            text: biteText,
          });

          // In Cartoon 2: spawn blood/candy shockwave ripple
          if (isCartoon2) {
            cartoon2RipplesRef.current.push({
              x: currentX,
              y: currentY,
              radius: 8 * currentZoom,
              maxRadius: 34 * currentZoom,
              color: '#ef4444',
              alpha: 0.95,
            });
          }

          // Spawn bite burst meat/spark fragments
          const numBiteP = isCartoon2 ? 16 : isCartoon1 ? 12 : 7;
          for (let bi = 0; bi < numBiteP; bi++) {
            const bAngle = Math.random() * Math.PI * 2;
            const bSpd = 1.3 + Math.random() * 3.2;
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY,
              vx: Math.cos(bAngle) * bSpd,
              vy: Math.sin(bAngle) * bSpd - 0.9,
              life: 450 + Math.random() * 300,
              maxLife: 600,
              size: isCartoon2 ? 6 + Math.random() * 5 : 4 + Math.random() * 4,
              color: Math.random() > 0.4 ? '#ef4444' : '#f97316',
              type: isCartoon2 ? 'candy' : 'spark',
              rot: Math.random() * Math.PI * 2,
              vRot: (Math.random() - 0.5) * 14,
            });
          }
        }
        prevElementsCountMapRef.current.set(creature.id, curElemCount);

        // Dashing transition detection
        const wasDashing = prevDashingMapRef.current.get(creature.id) || false;
        if (isDashing && !wasDashing) {
          if (isCartoonTheme) {
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY - 0.5,
              vx: 0,
              vy: -1.6,
              life: 600,
              maxLife: 600,
              size: isCartoon2 ? 19 : 17,
              color: isCartoon2 ? '#fb923c' : '#f97316',
              type: 'comic_text',
              text: isCartoon2 ? '💨 ПУУК! 💨' : '🏎️ РЕВ МОТОРА! ⚡',
            });

            if (isCartoon2) {
              cartoon2RipplesRef.current.push({
                x: currentX,
                y: currentY,
                radius: 8 * currentZoom,
                maxRadius: 36 * currentZoom,
                color: '#38bdf8',
                alpha: 1.0,
              });
            }
          }
          // Trigger dash sound: fart in Cartoon 2, roaring engine in Cartoon 1
          soundFx.playDash();
        }
        prevDashingMapRef.current.set(creature.id, isDashing);

        // Braking transition detection
        const isCreatureBraking = creature.isBraking || creature.state === 'braking' || (isPlayerCreature && isBrakingRef.current);
        const wasBraking = prevBrakingMapRef.current.get(creature.id) || false;
        if (isCreatureBraking && !wasBraking) {
          if (isCartoonTheme) {
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY - 0.4,
              vx: 0,
              vy: -1.3,
              life: 550,
              maxLife: 550,
              size: isCartoon2 ? 18 : 16,
              color: '#f43f5e',
              type: 'comic_text',
              text: isCartoon2 ? 'ВИЗГ ШИН! 🛑🛞' : 'ВИЗГ ШИН! 🛑🛞',
            });
          }
          // Trigger tire screech sound in both modes
          soundFx.playBrake();
        }
        prevBrakingMapRef.current.set(creature.id, isCreatureBraking);

        // Invulnerability transition detection & audio/effects trigger
        const isInvulnerable = Boolean(creature.isInvulnerable || (creature.invulnerableSec && creature.invulnerableSec > 0));
        const wasInvulnerable = prevInvulnerableMapRef.current.get(creature.id) || false;
        const isSelectedOrPlayer = isPlayerCreature || creature.id === selectedCreatureId;
        if (isInvulnerable && !wasInvulnerable) {
          if (isSelectedOrPlayer) {
            soundFx.playInvulnerabilityActivate(currentGridTheme);
          }
          if (isCartoon2) {
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY - 0.5,
              vx: 0,
              vy: -1.4,
              life: 750,
              maxLife: 750,
              size: 20,
              color: '#facc15',
              type: 'comic_text',
              text: '🌟 НЕУЯЗВИМ! (10с) 🛡️',
            });
            for (let k = 0; k < 12; k++) {
              const a = (k * Math.PI * 2) / 12;
              boostParticlesRef.current.push({
                x: currentX,
                y: currentY,
                vx: Math.cos(a) * 2.2,
                vy: Math.sin(a) * 2.2,
                life: 600,
                maxLife: 600,
                size: 8 + Math.random() * 6,
                color: ['#facc15', '#ec4899', '#38bdf8', '#4ade80'][k % 4],
                type: 'star',
                rot: Math.random() * Math.PI * 2,
                vRot: (Math.random() - 0.5) * 8,
              });
            }
          } else if (isCartoon1) {
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY - 0.4,
              vx: 0,
              vy: -1.2,
              life: 700,
              maxLife: 700,
              size: 18,
              color: '#f59e0b',
              type: 'comic_text',
              text: '⭐ НЕУЯЗВИМОСТЬ! ⭐',
            });
          }
        } else if (!isInvulnerable && wasInvulnerable) {
          if (isSelectedOrPlayer) {
            soundFx.playInvulnerabilityExpire(currentGridTheme);
          }
        }
        prevInvulnerableMapRef.current.set(creature.id, isInvulnerable);

        // Sleeping creature ZZZ particles in Cartoon Mode
        if (creature.isSleeping && isCartoonTheme && Math.random() < 0.07) {
          boostParticlesRef.current.push({
            x: currentX + (Math.random() - 0.5) * 0.3,
            y: currentY - 0.3,
            vx: (Math.random() - 0.5) * 0.2 + 0.2,
            vy: -0.6 - Math.random() * 0.4,
            life: 850,
            maxLife: 850,
            size: isCartoon2 ? 16 + Math.random() * 4 : 14 + Math.random() * 4,
            color: isCartoon2 ? '#c084fc' : '#818cf8',
            type: 'sleep_z',
            text: 'Z',
          });
        }

        let cTrail = trailsRef.current.get(creature.id);
        if (!cTrail) {
          cTrail = [];
          trailsRef.current.set(creature.id, cTrail);
        }

        const lastPt = cTrail[cTrail.length - 1];
        const distSq = lastPt ? Math.pow(currentX - lastPt.x, 2) + Math.pow(currentY - lastPt.y, 2) : 999;

        if (isDashing || distSq > 0.04 || !lastPt || (now - lastPt.time > 65)) {
          cTrail.push({
            x: currentX,
            y: currentY,
            angleDeg: currentAngle,
            color: creature.color || '#ec4899',
            isDashing,
            time: now,
          });
        }

        const maxAge = isDashing ? 900 : 480;
        while (cTrail.length > 0 && now - cTrail[0].time > maxAge) {
          cTrail.shift();
        }

        // Spawn dynamic boost wake particles when accelerating
        if (isDashing) {
          const rearAngleRad = ((currentAngle + 180) * Math.PI) / 180;
          const numParticles = isCartoon2 ? 7 : isCartoon1 ? 5 : currentGridTheme === 'notebook' ? 2 : 4;
          for (let p = 0; p < numParticles; p++) {
            const spread = (Math.random() - 0.5) * 0.85;
            const spd = 0.9 + Math.random() * 2.6;
            const vx = Math.cos(rearAngleRad + spread) * spd;
            const vy = Math.sin(rearAngleRad + spread) * spd;
            const life = 200 + Math.random() * 300;

            let pColor = '#f59e0b';
            let pType: BoostParticle['type'] = 'flame';
            if (isCartoon2) {
              const d = Math.random();
              pType = d < 0.35 ? 'rainbow' : d < 0.65 ? 'star' : 'puff';
              const c2Colors = ['#f43f5e', '#38bdf8', '#facc15', '#a855f7', '#4ade80'];
              pColor = c2Colors[Math.floor(Math.random() * c2Colors.length)];
            } else if (isCartoon1) {
              pType = Math.random() > 0.4 ? 'puff' : 'star';
              pColor = Math.random() > 0.5 ? '#facc15' : (creature.color || '#ec4899');
            } else if (currentGridTheme === 'notebook') {
              pType = 'ink';
              pColor = Math.random() > 0.4 ? '#1e293b' : '#3b82f6';
            } else if (currentGridTheme === 'blueprint') {
              pType = 'spark';
              pColor = Math.random() > 0.5 ? '#38bdf8' : '#818cf8';
            } else {
              pType = Math.random() > 0.35 ? 'flame' : 'spark';
              pColor = Math.random() > 0.5 ? '#f59e0b' : (creature.color || '#ec4899');
            }

            boostParticlesRef.current.push({
              x: currentX - Math.cos((currentAngle * Math.PI) / 180) * 0.35,
              y: currentY - Math.sin((currentAngle * Math.PI) / 180) * 0.35,
              vx,
              vy,
              life,
              maxLife: life,
              size: isCartoon2 ? 7 + Math.random() * 7 : isCartoon1 ? 6 + Math.random() * 6 : 3 + Math.random() * 4.5,
              color: pColor,
              type: pType,
              rot: Math.random() * Math.PI * 2,
              vRot: (Math.random() - 0.5) * 12,
            });
          }

          if (Math.random() < 0.22) {
            boostParticlesRef.current.push({
              x: currentX,
              y: currentY,
              vx: 0,
              vy: 0,
              life: 300,
              maxLife: 300,
              size: isCartoon2 ? 14 : 10,
              color: isCartoon2 ? 'rgba(244, 114, 182, 0.85)' : isCartoon1 ? 'rgba(236, 72, 153, 0.7)' : currentGridTheme === 'notebook' ? 'rgba(30, 41, 59, 0.45)' : 'rgba(245, 158, 11, 0.65)',
              type: 'shockwave',
            });
          }
        }
      });

      // 2. Render Motion Trails (Шлейф) for each creature
      trailsRef.current.forEach((cTrail) => {
        if (cTrail.length < 2) return;

        for (let i = 0; i < cTrail.length - 1; i++) {
          const p1 = cTrail[i];
          const p2 = cTrail[i + 1];
          const age = now - p1.time;
          const alpha = Math.max(0, 1 - age / 750);
          if (alpha <= 0.01) continue;

          // Skip wrapping segments across toroidal boundary
          if (Math.abs(p2.x - p1.x) > 5 || Math.abs(p2.y - p1.y) > 5) continue;

          const screenP1 = {
            x: currentOffset.x + p1.x * scaledCell,
            y: currentOffset.y + p1.y * scaledCell,
          };
          const screenP2 = {
            x: currentOffset.x + p2.x * scaledCell,
            y: currentOffset.y + p2.y * scaledCell,
          };

          ctx.save();
          if (isCartoonTheme) {
            // Rainbow Candy / Comic Ribbon Trail!
            const widthFactor = i / cTrail.length;
            const rainbowColors = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a855f7', '#ec4899'];
            const segColor = rainbowColors[i % rainbowColors.length];
            const baseWidth = p1.isDashing ? 16 : 9;

            // Outer dark comic stroke
            ctx.beginPath();
            ctx.moveTo(screenP1.x, screenP1.y);
            ctx.lineTo(screenP2.x, screenP2.y);
            ctx.lineWidth = Math.max(1, (baseWidth + 3) * widthFactor * currentZoom);
            ctx.lineCap = 'round';
            ctx.strokeStyle = `rgba(15, 23, 42, ${alpha * 0.4})`;
            ctx.stroke();

            // Inner vibrant rainbow stripe
            ctx.beginPath();
            ctx.moveTo(screenP1.x, screenP1.y);
            ctx.lineTo(screenP2.x, screenP2.y);
            ctx.lineWidth = Math.max(1, baseWidth * widthFactor * currentZoom);
            ctx.strokeStyle = p1.isDashing ? segColor : `${segColor}${Math.round(alpha * 220).toString(16).padStart(2, '0')}`;
            ctx.stroke();

            // Highlight glint line
            ctx.beginPath();
            ctx.moveTo(screenP1.x, screenP1.y);
            ctx.lineTo(screenP2.x, screenP2.y);
            ctx.lineWidth = Math.max(1, 2.5 * widthFactor * currentZoom);
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.85})`;
            ctx.stroke();
          } else if (currentGridTheme === 'notebook') {
            // Hand-drawn sketch speed trails (Чернильный / карандашный шлейф)
            ctx.beginPath();
            ctx.moveTo(screenP1.x, screenP1.y);
            ctx.lineTo(screenP2.x, screenP2.y);
            ctx.strokeStyle = p1.isDashing ? `rgba(225, 29, 72, ${alpha * 0.85})` : `rgba(30, 41, 59, ${alpha * 0.45})`;
            ctx.lineWidth = (p1.isDashing ? 3.5 : 2) * currentZoom;
            ctx.setLineDash(p1.isDashing ? [8 * currentZoom, 4 * currentZoom] : [4 * currentZoom, 4 * currentZoom]);
            ctx.stroke();

            // Parallel sketch speed streaks when dashing
            if (p1.isDashing) {
              const perpX = -(screenP2.y - screenP1.y);
              const perpY = screenP2.x - screenP1.x;
              const len = Math.hypot(perpX, perpY) || 1;
              const normPerx = (perpX / len) * 7 * currentZoom;
              const normPery = (perpY / len) * 7 * currentZoom;

              ctx.beginPath();
              ctx.moveTo(screenP1.x + normPerx, screenP1.y + normPery);
              ctx.lineTo(screenP2.x + normPerx, screenP2.y + normPery);
              ctx.strokeStyle = `rgba(59, 130, 246, ${alpha * 0.6})`;
              ctx.lineWidth = 1.5 * currentZoom;
              ctx.stroke();

              ctx.beginPath();
              ctx.moveTo(screenP1.x - normPerx, screenP1.y - normPery);
              ctx.lineTo(screenP2.x - normPerx, screenP2.y - normPery);
              ctx.stroke();
            }
          } else {
            // Glowing neon ribbon trail for game / dark / blueprint themes
            const widthFactor = i / cTrail.length;
            const baseWidth = p1.isDashing ? 14 : 7;

            ctx.beginPath();
            ctx.moveTo(screenP1.x, screenP1.y);
            ctx.lineTo(screenP2.x, screenP2.y);
            ctx.lineWidth = Math.max(1, baseWidth * widthFactor * currentZoom);
            ctx.lineCap = 'round';
            ctx.strokeStyle = p1.isDashing
              ? `rgba(245, 158, 11, ${alpha * 0.85})`
              : `${p1.color}${Math.round(alpha * 120).toString(16).padStart(2, '0')}`;
            ctx.stroke();

            if (p1.isDashing) {
              ctx.beginPath();
              ctx.moveTo(screenP1.x, screenP1.y);
              ctx.lineTo(screenP2.x, screenP2.y);
              ctx.lineWidth = Math.max(1, 5 * widthFactor * currentZoom);
              ctx.strokeStyle = `rgba(254, 240, 138, ${alpha * 0.95})`;
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      });

      // 3. Render and update flying boost particles
      const remainingParticles: typeof boostParticlesRef.current = [];
      boostParticlesRef.current.forEach((pt) => {
        pt.life -= 16.6;
        if (pt.life <= 0) return;

        pt.x += pt.vx * 0.016;
        pt.y += pt.vy * 0.016;

        const progress = pt.life / pt.maxLife;
        const px = currentOffset.x + pt.x * scaledCell;
        const py = currentOffset.y + pt.y * scaledCell;

        ctx.save();
        if (pt.type === 'comic_text' && pt.text) {
          const scale = 1 + (1 - progress) * 0.3;
          ctx.translate(px, py);
          ctx.scale(scale * currentZoom, scale * currentZoom);
          ctx.globalAlpha = Math.min(1, progress * 1.5);

          ctx.font = '900 15px "Arial Black", "Impact", system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 4;
          ctx.lineJoin = 'miter';
          ctx.strokeText(pt.text, 0, 0);

          ctx.fillStyle = pt.color || '#facc15';
          ctx.fillText(pt.text, 0, 0);
        } else if (pt.type === 'sleep_z') {
          const wobble = Math.sin(pt.life * 0.015) * 6 * currentZoom;
          ctx.translate(px + wobble, py);
          ctx.globalAlpha = progress * 0.9;
          ctx.font = `bold ${pt.size * currentZoom}px "Comic Sans MS", system-ui, sans-serif`;
          ctx.fillStyle = '#818cf8';
          ctx.strokeStyle = '#312e81';
          ctx.lineWidth = 2;
          ctx.strokeText('Z', 0, 0);
          ctx.fillText('Z', 0, 0);
        } else if (pt.type === 'star') {
          ctx.translate(px, py);
          if (pt.rot !== undefined) ctx.rotate(pt.rot);
          if (pt.vRot !== undefined) pt.rot = (pt.rot || 0) + pt.vRot * 0.016;
          ctx.globalAlpha = progress;

          const r = pt.size * currentZoom;
          ctx.beginPath();
          for (let s = 0; s < 5; s++) {
            const outerA = (s * Math.PI * 2) / 5 - Math.PI / 2;
            const innerA = outerA + Math.PI / 5;
            if (s === 0) ctx.moveTo(Math.cos(outerA) * r, Math.sin(outerA) * r);
            else ctx.lineTo(Math.cos(outerA) * r, Math.sin(outerA) * r);
            ctx.lineTo(Math.cos(innerA) * (r * 0.45), Math.sin(innerA) * (r * 0.45));
          }
          ctx.closePath();
          ctx.fillStyle = pt.color;
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2 * currentZoom;
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(0, 0, r * 0.25, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
        } else if (pt.type === 'confetti') {
          ctx.translate(px, py);
          if (pt.rot !== undefined) ctx.rotate(pt.rot);
          if (pt.vRot !== undefined) pt.rot = (pt.rot || 0) + pt.vRot * 0.016;
          ctx.globalAlpha = progress;

          const cw = pt.size * currentZoom;
          const ch = pt.size * 0.6 * currentZoom;
          ctx.fillStyle = pt.color;
          ctx.fillRect(-cw / 2, -ch / 2, cw, ch);
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1;
          ctx.strokeRect(-cw / 2, -ch / 2, cw, ch);
        } else if (pt.type === 'candy') {
          ctx.translate(px, py);
          if (pt.rot !== undefined) ctx.rotate(pt.rot);
          if (pt.vRot !== undefined) pt.rot = (pt.rot || 0) + pt.vRot * 0.016;
          ctx.globalAlpha = progress;

          const r = pt.size * currentZoom;
          // Candy wrapper / ball
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.2 * currentZoom;
          ctx.stroke();

          // Left candy wrapper twist
          ctx.beginPath();
          ctx.moveTo(-r * 0.6, 0);
          ctx.lineTo(-r * 1.2, -r * 0.5);
          ctx.lineTo(-r * 1.2, r * 0.5);
          ctx.closePath();
          ctx.fillStyle = pt.color;
          ctx.fill();
          ctx.stroke();

          // Right candy wrapper twist
          ctx.beginPath();
          ctx.moveTo(r * 0.6, 0);
          ctx.lineTo(r * 1.2, -r * 0.5);
          ctx.lineTo(r * 1.2, r * 0.5);
          ctx.closePath();
          ctx.fillStyle = pt.color;
          ctx.fill();
          ctx.stroke();
        } else if (pt.type === 'donut') {
          ctx.translate(px, py);
          if (pt.rot !== undefined) ctx.rotate(pt.rot);
          if (pt.vRot !== undefined) pt.rot = (pt.rot || 0) + pt.vRot * 0.016;
          ctx.globalAlpha = progress;

          const r = pt.size * currentZoom;
          // Doughnut ring
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#0f172a';
          ctx.lineWidth = 1.5 * currentZoom;
          ctx.stroke();

          // Glaze
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
          ctx.fillStyle = pt.color || '#ec4899';
          ctx.fill();

          // Donut Hole
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.35, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();
          ctx.stroke();
        } else if (pt.type === 'rainbow') {
          ctx.translate(px, py);
          ctx.globalAlpha = progress * 0.9;
          const r = pt.size * (1.2 + (1 - progress) * 0.5) * currentZoom;

          const rainbowRingColors = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a855f7'];
          rainbowRingColors.forEach((rc, rIdx) => {
            const curR = r * (1 - rIdx * 0.15);
            if (curR > 0) {
              ctx.beginPath();
              ctx.arc(0, 0, curR, 0, Math.PI * 2);
              ctx.fillStyle = rc;
              ctx.fill();
            }
          });
        } else if (pt.type === 'puff') {
          ctx.translate(px, py);
          ctx.globalAlpha = progress * 0.85;
          const pr = pt.size * (1.6 - progress * 0.6) * currentZoom;

          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = 'rgba(15, 23, 42, 0.5)';
          ctx.lineWidth = 1.5 * currentZoom;

          ctx.beginPath();
          ctx.arc(0, 0, pr * 0.7, 0, Math.PI * 2);
          ctx.arc(pr * 0.4, -pr * 0.2, pr * 0.5, 0, Math.PI * 2);
          ctx.arc(-pr * 0.4, -pr * 0.2, pr * 0.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else if (pt.type === 'shockwave') {
          const currentRadius = (pt.size + (1 - progress) * 22) * currentZoom;
          ctx.beginPath();
          ctx.arc(px, py, currentRadius, 0, Math.PI * 2);
          ctx.strokeStyle = pt.color.replace(/[\d\.]+\)$/, `${progress * 0.6})`);
          ctx.lineWidth = 2 * currentZoom;
          ctx.stroke();
        } else if (pt.type === 'ink') {
          ctx.beginPath();
          ctx.arc(px, py, pt.size * progress * currentZoom, 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = progress * 0.85;
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(px, py, pt.size * progress * currentZoom, 0, Math.PI * 2);
          ctx.fillStyle = pt.color;
          ctx.globalAlpha = progress;
          ctx.shadowColor = pt.color;
          ctx.shadowBlur = 8 * currentZoom;
          ctx.fill();
        }
        ctx.restore();

        remainingParticles.push(pt);
      });
      boostParticlesRef.current = remainingParticles;

      // Render Creatures with Physics Elements
      currentCreatures.forEach((creature) => {
        const animState = animMap.get(creature.id);
        const currentX = animState ? animState.displayX : creature.x;
        const currentY = animState ? animState.displayY : creature.y;
        const currentAngle = animState ? animState.displayAngle : creature.angleDeg;

        // Base head orientation angle and rotation delta
        const baseHeadAngle = determineCreatureHeadAngle(creature.elements);
        const rotationDelta = currentAngle - baseHeadAngle;

        const isSelected = creature.id === currentSelectedId;
        const animStep = animState ? animState.muscleAnimStep : creature.muscleStep;
        const currentContractFactor = 0.5 - 0.5 * Math.cos(animStep * Math.PI);
        const isMuscleContracted = currentContractFactor > 0.05;

        // Calculate kinematic bends ONCE per creature per frame
        const bentMap = calculateKinematicBends(creature.elements, animStep);

        // Toroidal wrapper offsets for seamless boundary transition
        const wrapOffsets: { x: number; y: number }[] = [{ x: 0, y: 0 }];
        const edgeThresh = halfWorld - 10;
        if (currentX > edgeThresh) wrapOffsets.push({ x: -worldSize, y: 0 });
        if (currentX < -edgeThresh) wrapOffsets.push({ x: worldSize, y: 0 });
        if (currentY > edgeThresh) wrapOffsets.push({ x: 0, y: -worldSize });
        if (currentY < -edgeThresh) wrapOffsets.push({ x: 0, y: worldSize });

        wrapOffsets.forEach((off) => {
          const centerPos = {
            x: currentOffset.x + (currentX + off.x) * scaledCell,
            y: currentOffset.y + (currentY + off.y) * scaledCell,
          };

          ctx.save();
          ctx.translate(centerPos.x, centerPos.y);
          ctx.rotate((rotationDelta * Math.PI) / 180);

          // Cartoon 2: Squash & Stretch Bouncy Jelly Animation
          if (isCartoon2) {
            const squish = Math.sin(animStep * Math.PI * 2) * 0.08;
            ctx.scale(1 + squish, 1 - squish);
          }

          // Selection boundary
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(0, 0, 36 * currentZoom, 0, Math.PI * 2);
            ctx.strokeStyle = isCartoon2 ? '#ec4899' : '#6366f1';
            ctx.lineWidth = 2.5 * currentZoom;
            ctx.setLineDash([6 * currentZoom, 4 * currentZoom]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          // Dynamic Boost / Dash visual effect
          const canDash = (creature.foodEaten ?? 0) > 0;
          const isDashing = (creature.state === 'dashing' || (creature as any).isDashing || (isSelected && currentSpace)) && canDash;
          if (isDashing) {
            const t = performance.now() * 0.018;
            const flameLen = ((isCartoon2 ? 38 : 28) + Math.sin(t * 6) * 10) * currentZoom;
            const flameWidth = (isCartoon2 ? 24 : 18) * currentZoom;

            ctx.save();
            const backAngleRad = ((baseHeadAngle + 180) * Math.PI) / 180;
            ctx.rotate(backAngleRad);

            if (isCartoon2) {
              // Rainbow Turbo Rocket Thruster for Cartoon 2
              const flameRings = ['#f43f5e', '#fb923c', '#facc15', '#38bdf8', '#c084fc'];
              flameRings.forEach((fc, fIdx) => {
                const fScale = 1 - fIdx * 0.18;
                ctx.beginPath();
                ctx.moveTo((-flameWidth * fScale) / 2, 0);
                ctx.lineTo(0, flameLen * fScale);
                ctx.lineTo((flameWidth * fScale) / 2, 0);
                ctx.closePath();
                ctx.fillStyle = fc;
                ctx.shadowColor = fc;
                ctx.shadowBlur = 10 * currentZoom;
                ctx.fill();
              });
            } else {
              // Outer flame
              ctx.beginPath();
              ctx.moveTo(-flameWidth / 2, 0);
              ctx.lineTo(0, flameLen);
              ctx.lineTo(flameWidth / 2, 0);
              ctx.closePath();
              ctx.fillStyle = 'rgba(245, 158, 11, 0.8)';
              ctx.shadowColor = '#f59e0b';
              ctx.shadowBlur = 12 * currentZoom;
              ctx.fill();

              // Inner hot core
              ctx.beginPath();
              ctx.moveTo(-flameWidth / 3, 0);
              ctx.lineTo(0, flameLen * 0.65);
              ctx.lineTo(flameWidth / 3, 0);
              ctx.closePath();
              ctx.fillStyle = 'rgba(254, 240, 138, 0.95)';
              ctx.fill();
            }

            ctx.restore();
          }

          // Render each physical element
          creature.elements.forEach((el) => {
            const bent = bentMap.get(el.id) || { relX: el.relX, relY: el.relY, rotationDeg: 0 };
            const elX = bent.relX * scaledCell;
            const elY = bent.relY * scaledCell;

            ctx.save();
            ctx.translate(elX, elY);
            ctx.rotate((bent.rotationDeg * Math.PI) / 180);

            if (el.type === 'head' || el.type === 'head-jaw') {
              const isJaw = el.type === 'head-jaw';

              if (isCartoon2) {
                // ==========================================
                // --- CARTOON 2: ANIME SWEET CANDY HEAD ---
                // ==========================================
                const headR = (isJaw ? 18 : 16) * currentZoom;

                // Outer Comic Glow / Stroke
                ctx.beginPath();
                ctx.arc(0, 0, headR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#ef4444' : (creature.color || '#ec4899');
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 4 * currentZoom;
                ctx.stroke();

                // Glossy Double Bubble Highlight
                ctx.beginPath();
                ctx.arc(-headR * 0.35, -headR * 0.35, headR * 0.35, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
                ctx.beginPath();
                ctx.arc(headR * 0.25, headR * 0.3, headR * 0.16, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.fill();

                // Cute Head Accessory in Cartoon 2 (NO CROWNS - strictly non-confusing cute shapes: Party Hat, Star Antenna, Kitten Ears, Flower Daisy, Cute Ribbon Bow)
                const idSeed = parseInt(creature.id.replace(/\D/g, '') || '1', 10);
                const accessoryVariants = ['party_hat', 'star_antenna', 'cat_ears', 'flower', 'cute_bow'] as const;
                const accessoryType = accessoryVariants[Math.abs(idSeed) % accessoryVariants.length];

                if (accessoryType === 'party_hat') {
                  // Striped Party Cone Hat 🥳
                  ctx.save();
                  ctx.translate(0, -headR - 2 * currentZoom);
                  ctx.beginPath();
                  ctx.moveTo(-7 * currentZoom, 0);
                  ctx.lineTo(0, -18 * currentZoom);
                  ctx.lineTo(7 * currentZoom, 0);
                  ctx.closePath();
                  ctx.fillStyle = '#38bdf8';
                  ctx.fill();
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 1.8 * currentZoom;
                  ctx.stroke();

                  // Fluffy Pom-Pom on top
                  ctx.beginPath();
                  ctx.arc(0, -19 * currentZoom, 3.5 * currentZoom, 0, Math.PI * 2);
                  ctx.fillStyle = '#f43f5e';
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
                } else if (accessoryType === 'star_antenna') {
                  // Glowing Star Antenna ✨
                  ctx.save();
                  ctx.translate(0, -headR);
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  ctx.lineTo(0, -10 * currentZoom);
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 2 * currentZoom;
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.arc(0, -12 * currentZoom, 4 * currentZoom, 0, Math.PI * 2);
                  ctx.fillStyle = '#fde047';
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
                } else if (accessoryType === 'cat_ears') {
                  // Cute Kitten Ears 🐱
                  [-7, 7].forEach((earX) => {
                    ctx.beginPath();
                    ctx.moveTo((earX - 3.5) * currentZoom, -headR + 2 * currentZoom);
                    ctx.lineTo(earX * currentZoom, -headR - 7 * currentZoom);
                    ctx.lineTo((earX + 3.5) * currentZoom, -headR + 2 * currentZoom);
                    ctx.closePath();
                    ctx.fillStyle = creature.color || '#ec4899';
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1.8 * currentZoom;
                    ctx.stroke();

                    // Inner ear pink
                    ctx.beginPath();
                    ctx.moveTo((earX - 1.8) * currentZoom, -headR + 1 * currentZoom);
                    ctx.lineTo(earX * currentZoom, -headR - 4 * currentZoom);
                    ctx.lineTo((earX + 1.8) * currentZoom, -headR + 1 * currentZoom);
                    ctx.closePath();
                    ctx.fillStyle = '#fbcfe8';
                    ctx.fill();
                  });
                } else if (accessoryType === 'flower') {
                  // Cute Daisy Flower 🌸
                  ctx.save();
                  ctx.translate(0, -headR - 3 * currentZoom);
                  // 5 rounded petals
                  for (let pet = 0; pet < 5; pet++) {
                    const pAngle = (pet * Math.PI * 2) / 5;
                    ctx.beginPath();
                    ctx.arc(Math.cos(pAngle) * 4.5 * currentZoom, Math.sin(pAngle) * 4.5 * currentZoom, 3 * currentZoom, 0, Math.PI * 2);
                    ctx.fillStyle = '#fbcfe8';
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1.2 * currentZoom;
                    ctx.stroke();
                  }
                  // Flower center
                  ctx.beginPath();
                  ctx.arc(0, 0, 3 * currentZoom, 0, Math.PI * 2);
                  ctx.fillStyle = '#facc15';
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
                } else if (accessoryType === 'cute_bow') {
                  // Sweet Ribbon Bow 🎀
                  ctx.save();
                  ctx.translate(0, -headR - 2 * currentZoom);
                  // Left bow wing
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  ctx.lineTo(-7 * currentZoom, -4 * currentZoom);
                  ctx.lineTo(-7 * currentZoom, 4 * currentZoom);
                  ctx.closePath();
                  ctx.fillStyle = '#ec4899';
                  ctx.fill();
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 1.5 * currentZoom;
                  ctx.stroke();
                  // Right bow wing
                  ctx.beginPath();
                  ctx.moveTo(0, 0);
                  ctx.lineTo(7 * currentZoom, -4 * currentZoom);
                  ctx.lineTo(7 * currentZoom, 4 * currentZoom);
                  ctx.closePath();
                  ctx.fillStyle = '#ec4899';
                  ctx.fill();
                  ctx.stroke();
                  // Center knot
                  ctx.beginPath();
                  ctx.arc(0, 0, 2.5 * currentZoom, 0, Math.PI * 2);
                  ctx.fillStyle = '#f43f5e';
                  ctx.fill();
                  ctx.stroke();
                  ctx.restore();
                }

                // Predatory teeth & chomping animation for jaws
                if (isJaw) {
                  const chompOffset = Math.sin(now * 0.02) * 3 * currentZoom;
                  ctx.fillStyle = '#ffffff';
                  for (let t = -2; t <= 2; t++) {
                    const tx = t * 5.2 * currentZoom;
                    ctx.beginPath();
                    ctx.moveTo(tx - 3 * currentZoom, -headR + 2 * currentZoom);
                    ctx.lineTo(tx, -headR - (8 * currentZoom + chompOffset));
                    ctx.lineTo(tx + 3 * currentZoom, -headR + 2 * currentZoom);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1.5 * currentZoom;
                    ctx.stroke();
                  }

                  // Comic anger mark 💢 on forehead
                  ctx.strokeStyle = '#b91c1c';
                  ctx.lineWidth = 2 * currentZoom;
                  ctx.beginPath();
                  ctx.moveTo(-4 * currentZoom, -10 * currentZoom);
                  ctx.lineTo(-4 * currentZoom, -4 * currentZoom);
                  ctx.moveTo(-7 * currentZoom, -7 * currentZoom);
                  ctx.lineTo(-1 * currentZoom, -7 * currentZoom);
                  ctx.stroke();
                }

                // Eyes Logic
                const blinkCycle = (now + idSeed * 500) % 3000;
                const isBlinking = blinkCycle < 180;
                const eyeR = (isJaw ? 7.2 : 6.8) * currentZoom;

                [-6, 6].forEach((eyeOffsetX) => {
                  const ex = eyeOffsetX * currentZoom;
                  const ey = -4.5 * currentZoom;

                  if (creature.isSleeping) {
                    // Cute sleeping eyes `⌒`
                    ctx.beginPath();
                    ctx.arc(ex, ey, eyeR * 0.8, Math.PI * 0.1, Math.PI * 0.9);
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.5 * currentZoom;
                    ctx.stroke();

                    // Sleep snot bubble 🫧 on right side
                    if (eyeOffsetX > 0) {
                      const bubblePulse = (1 + Math.sin(now * 0.006) * 0.3) * 5 * currentZoom;
                      ctx.beginPath();
                      ctx.arc(ex + 8 * currentZoom, ey + 4 * currentZoom, bubblePulse, 0, Math.PI * 2);
                      ctx.fillStyle = 'rgba(186, 230, 253, 0.75)';
                      ctx.fill();
                      ctx.strokeStyle = '#0284c7';
                      ctx.lineWidth = 1.2 * currentZoom;
                      ctx.stroke();
                    }
                  } else if (isDashing) {
                    // Excited anime sparkle star eyes! ⭐
                    ctx.beginPath();
                    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2 * currentZoom;
                    ctx.stroke();

                    // Star pupil
                    const sr = eyeR * 0.85;
                    ctx.beginPath();
                    for (let s = 0; s < 4; s++) {
                      const a = (s * Math.PI * 2) / 4;
                      if (s === 0) ctx.moveTo(ex + Math.cos(a) * sr, ey + Math.sin(a) * sr);
                      else ctx.lineTo(ex + Math.cos(a) * sr, ey + Math.sin(a) * sr);
                      ctx.lineTo(ex + Math.cos(a + Math.PI / 4) * (sr * 0.35), ey + Math.sin(a + Math.PI / 4) * (sr * 0.35));
                    }
                    ctx.closePath();
                    ctx.fillStyle = '#f59e0b';
                    ctx.fill();
                  } else if (isBlinking) {
                    // Closed blinking eyelid arc ⌒
                    ctx.beginPath();
                    ctx.arc(ex, ey, eyeR * 0.85, Math.PI * 0.15, Math.PI * 0.85);
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.4 * currentZoom;
                    ctx.stroke();
                  } else {
                    // Big anime eyes with multi catchlights
                    ctx.beginPath();
                    ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
                    ctx.fillStyle = isJaw ? '#fef08a' : '#ffffff';
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2 * currentZoom;
                    ctx.stroke();

                    const pupilR = eyeR * 0.65;
                    ctx.beginPath();
                    ctx.arc(ex, ey, pupilR, 0, Math.PI * 2);
                    ctx.fillStyle = isJaw ? '#b91c1c' : '#0f172a';
                    ctx.fill();

                    // Triple starry catchlights
                    ctx.beginPath();
                    ctx.arc(ex - 1.5 * currentZoom, ey - 1.5 * currentZoom, 1.8 * currentZoom, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();

                    ctx.beginPath();
                    ctx.arc(ex + 1.2 * currentZoom, ey + 1.2 * currentZoom, 0.9 * currentZoom, 0, Math.PI * 2);
                    ctx.arc(ex - 1.2 * currentZoom, ey + 1.8 * currentZoom, 0.7 * currentZoom, 0, Math.PI * 2);
                    ctx.fill();
                  }
                });

                // Rosy Pink Heart Blush Cheeks & Open Smile
                if (!isJaw) {
                  ctx.fillStyle = 'rgba(251, 113, 133, 0.85)';
                  ctx.beginPath();
                  ctx.arc(-8.5 * currentZoom, 2 * currentZoom, 2.8 * currentZoom, 0, Math.PI * 2);
                  ctx.arc(8.5 * currentZoom, 2 * currentZoom, 2.8 * currentZoom, 0, Math.PI * 2);
                  ctx.fill();

                  // Big happy open mouth with pink tongue 👅
                  ctx.beginPath();
                  ctx.arc(0, 2 * currentZoom, 4.5 * currentZoom, 0, Math.PI);
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 2 * currentZoom;
                  ctx.fillStyle = '#e11d48';
                  ctx.fill();
                  ctx.stroke();

                  // Bouncy Tongue
                  ctx.beginPath();
                  ctx.arc(0, 4.5 * currentZoom, 2.5 * currentZoom, 0, Math.PI);
                  ctx.fillStyle = '#fda4af';
                  ctx.fill();
                } else {
                  // Angry slanted eyebrows for predator
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 2.5 * currentZoom;
                  ctx.beginPath();
                  ctx.moveTo(-10 * currentZoom, -11 * currentZoom);
                  ctx.lineTo(-2 * currentZoom, -7 * currentZoom);
                  ctx.moveTo(10 * currentZoom, -11 * currentZoom);
                  ctx.lineTo(2 * currentZoom, -7 * currentZoom);
                  ctx.stroke();
                }
              } else if (isCartoon1) {
                // --- ULTRA-CARTOON CUTE HEAD WITH GOOGLY EYES & EMOTIONS ---
                const headR = (isJaw ? 17 : 15) * currentZoom;

                // Outer bold comic stroke
                ctx.beginPath();
                ctx.arc(0, 0, headR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#f43f5e' : (creature.color || '#ec4899');
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 3.5 * currentZoom;
                ctx.stroke();

                // Glossy bubble highlight
                ctx.beginPath();
                ctx.arc(-headR * 0.35, -headR * 0.35, headR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fill();

                // Predatory teeth & chomping animation
                if (isJaw) {
                  const chompOffset = Math.sin(now * 0.015) * 2 * currentZoom;
                  ctx.fillStyle = '#ffffff';
                  for (let t = -2; t <= 2; t++) {
                    const tx = t * 4.8 * currentZoom;
                    ctx.beginPath();
                    ctx.moveTo(tx - 2.5 * currentZoom, -headR + 2 * currentZoom);
                    ctx.lineTo(tx, -headR - (6 * currentZoom + chompOffset));
                    ctx.lineTo(tx + 2.5 * currentZoom, -headR + 2 * currentZoom);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 1.2 * currentZoom;
                    ctx.stroke();
                  }
                }

                // Eyelid blink cycle
                const idSeed = parseInt(creature.id.replace(/\D/g, '') || '1', 10);
                const blinkCycle = (now + idSeed * 500) % 3200;
                const isBlinking = blinkCycle < 180 || creature.isSleeping;

                const eyeR = (isJaw ? 6.5 : 6) * currentZoom;
                const pupilR = (isJaw ? 3.5 : 3) * currentZoom;

                // Two big expressive googly eyes
                [-5.5, 5.5].forEach((eyeOffsetX) => {
                  const ex = eyeOffsetX * currentZoom;
                  const ey = -5 * currentZoom;

                  // Eye white
                  ctx.beginPath();
                  ctx.arc(ex, ey, eyeR, 0, Math.PI * 2);
                  ctx.fillStyle = isJaw ? '#fef08a' : '#ffffff';
                  ctx.fill();
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 1.8 * currentZoom;
                  ctx.stroke();

                  if (isBlinking) {
                    // Closed sleeping / blinking cute eyelid arc ⌒
                    ctx.beginPath();
                    ctx.arc(ex, ey, eyeR * 0.85, Math.PI * 0.15, Math.PI * 0.85);
                    ctx.strokeStyle = '#0f172a';
                    ctx.lineWidth = 2.2 * currentZoom;
                    ctx.stroke();
                  } else {
                    // Large cartoon pupil with double catchlights
                    const pupilX = ex + (isJaw ? (eyeOffsetX < 0 ? 0.8 : -0.8) : 0) * currentZoom;
                    const pupilY = ey - 0.5 * currentZoom;

                    ctx.beginPath();
                    ctx.arc(pupilX, pupilY, pupilR, 0, Math.PI * 2);
                    ctx.fillStyle = isJaw ? '#991b1b' : '#0f172a';
                    ctx.fill();

                    // Main sparkle glint
                    ctx.beginPath();
                    ctx.arc(pupilX - 1.2 * currentZoom, pupilY - 1.2 * currentZoom, 1.4 * currentZoom, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();

                    // Secondary tiny sparkle glint
                    ctx.beginPath();
                    ctx.arc(pupilX + 1 * currentZoom, pupilY + 1 * currentZoom, 0.7 * currentZoom, 0, Math.PI * 2);
                    ctx.fillStyle = '#ffffff';
                    ctx.fill();
                  }
                });

                // Rosy pink blush cheeks on non-predator creatures
                if (!isJaw) {
                  ctx.fillStyle = 'rgba(244, 114, 182, 0.75)';
                  ctx.beginPath();
                  ctx.arc(-8 * currentZoom, 1 * currentZoom, 2.2 * currentZoom, 0, Math.PI * 2);
                  ctx.arc(8 * currentZoom, 1 * currentZoom, 2.2 * currentZoom, 0, Math.PI * 2);
                  ctx.fill();

                  // Big happy open smile :D
                  ctx.beginPath();
                  ctx.arc(0, 1 * currentZoom, 3.5 * currentZoom, 0, Math.PI);
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 1.8 * currentZoom;
                  ctx.stroke();
                  ctx.fillStyle = '#f43f5e';
                  ctx.fill();
                } else {
                  // Slanted angry comic eyebrows for predators (｀ω´)
                  ctx.strokeStyle = '#0f172a';
                  ctx.lineWidth = 2 * currentZoom;
                  ctx.beginPath();
                  ctx.moveTo(-9 * currentZoom, -10 * currentZoom);
                  ctx.lineTo(-2 * currentZoom, -7 * currentZoom);
                  ctx.stroke();

                  ctx.beginPath();
                  ctx.moveTo(9 * currentZoom, -10 * currentZoom);
                  ctx.lineTo(2 * currentZoom, -7 * currentZoom);
                  ctx.stroke();
                }
              } else if (isGameTheme) {
                const headR = (isJaw ? 16 : 14) * currentZoom;
                ctx.beginPath();
                ctx.arc(0, 0, headR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#dc2626' : (creature.color || '#ec4899');
                ctx.fill();
                ctx.strokeStyle = isJaw ? '#fef08a' : '#ffffff';
                ctx.lineWidth = (isJaw ? 2.8 : 2) * currentZoom;
                ctx.stroke();

                // Predatory sharp teeth if jaw
                if (isJaw) {
                  ctx.fillStyle = '#ffffff';
                  const toothSize = 5 * currentZoom;
                  for (let t = -2; t <= 2; t++) {
                    const tx = t * 4.5 * currentZoom;
                    ctx.beginPath();
                    ctx.moveTo(tx - 2 * currentZoom, -headR + 2 * currentZoom);
                    ctx.lineTo(tx, -headR - toothSize);
                    ctx.lineTo(tx + 2 * currentZoom, -headR + 2 * currentZoom);
                    ctx.closePath();
                    ctx.fill();
                    ctx.strokeStyle = '#991b1b';
                    ctx.lineWidth = 0.8 * currentZoom;
                    ctx.stroke();
                  }
                }

                // Two Cartoon Googly / Predator Eyes
                const eyeR = (isJaw ? 6 : 5.5) * currentZoom;
                const pupilR = (isJaw ? 3.2 : 2.8) * currentZoom;

                // Left Eye
                ctx.beginPath();
                ctx.arc(-5.5 * currentZoom, -5.5 * currentZoom, eyeR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#fef08a' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1 * currentZoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(-4.5 * currentZoom, -4.5 * currentZoom, pupilR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#991b1b' : '#0f172a';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(-5.5 * currentZoom, -5.5 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();

                // Right Eye
                ctx.beginPath();
                ctx.arc(5.5 * currentZoom, -5.5 * currentZoom, eyeR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#fef08a' : '#ffffff';
                ctx.fill();
                ctx.strokeStyle = '#000000';
                ctx.lineWidth = 1 * currentZoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(6.5 * currentZoom, -4.5 * currentZoom, pupilR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#991b1b' : '#0f172a';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(5.5 * currentZoom, -5.5 * currentZoom, 1.2 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
              } else {
                const headR = (isJaw ? 13 : 11) * currentZoom;
                ctx.beginPath();
                ctx.arc(0, 0, headR, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#fee2e2' : '#fef08a';
                ctx.fill();
                ctx.strokeStyle = isJaw ? '#ef4444' : '#eab308';
                ctx.lineWidth = 2.5 * currentZoom;
                ctx.stroke();

                if (isJaw) {
                  ctx.fillStyle = '#ef4444';
                  for (let t = -2; t <= 2; t++) {
                    const tx = t * 4 * currentZoom;
                    ctx.beginPath();
                    ctx.moveTo(tx - 2 * currentZoom, -headR);
                    ctx.lineTo(tx, -headR - 4 * currentZoom);
                    ctx.lineTo(tx + 2 * currentZoom, -headR);
                    ctx.fill();
                  }
                }

                ctx.beginPath();
                ctx.arc(0, 0, 4.5 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = isJaw ? '#7f1d1d' : '#0f172a';
                ctx.fill();

                ctx.beginPath();
                ctx.arc(-2 * currentZoom, -2 * currentZoom, 1.5 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.fill();
              }
            } else if (el.type === 'joint') {
              if (isCartoon2) {
                // Rainbow Jelly Candy Joint with Rotating Star inside!
                const jointR = 11 * currentZoom;
                ctx.beginPath();
                ctx.arc(0, 0, jointR, 0, Math.PI * 2);
                ctx.fillStyle = '#38bdf8';
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 3.2 * currentZoom;
                ctx.stroke();

                // Inner rotating sparkle star
                ctx.save();
                ctx.rotate(now * 0.003);
                ctx.beginPath();
                const starR = jointR * 0.55;
                for (let s = 0; s < 4; s++) {
                  const sa = (s * Math.PI * 2) / 4;
                  if (s === 0) ctx.moveTo(Math.cos(sa) * starR, Math.sin(sa) * starR);
                  else ctx.lineTo(Math.cos(sa) * starR, Math.sin(sa) * starR);
                  ctx.lineTo(Math.cos(sa + Math.PI / 4) * (starR * 0.35), Math.sin(sa + Math.PI / 4) * (starR * 0.35));
                }
                ctx.closePath();
                ctx.fillStyle = '#fde047';
                ctx.fill();
                ctx.restore();

                // Gloss highlight
                ctx.beginPath();
                ctx.arc(-jointR * 0.35, -jointR * 0.35, jointR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
              } else if (isCartoon1) {
                const jointR = 10 * currentZoom;
                ctx.beginPath();
                ctx.arc(0, 0, jointR, 0, Math.PI * 2);
                ctx.fillStyle = '#06b6d4';
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 2.8 * currentZoom;
                ctx.stroke();

                // Gloss reflection
                ctx.beginPath();
                ctx.arc(-jointR * 0.35, -jointR * 0.35, jointR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
                ctx.fill();
              } else if (isGameTheme) {
                const jointR = 9 * currentZoom;
                ctx.beginPath();
                ctx.arc(0, 0, jointR, 0, Math.PI * 2);
                ctx.fillStyle = '#06b6d4';
                ctx.fill();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.5 * currentZoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(-jointR * 0.3, -jointR * 0.3, jointR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.fill();
              } else {
                ctx.beginPath();
                ctx.arc(0, 0, 8 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = currentGridTheme === 'notebook' ? '#ffffff' : '#1e293b';
                ctx.fill();
                ctx.strokeStyle = '#38bdf8';
                ctx.lineWidth = 2.5 * currentZoom;
                ctx.stroke();

                ctx.beginPath();
                ctx.arc(0, 0, 3 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#0284c7';
                ctx.fill();
              }
            } else if (el.type.startsWith('edge-')) {
              let x1 = 0, y1 = 0, x2 = 0, y2 = 0;
              if (el.type === 'edge-h') { x1 = -scaledCell / 2; x2 = scaledCell / 2; }
              else if (el.type === 'edge-v') { y1 = -scaledCell / 2; y2 = scaledCell / 2; }
              else if (el.type === 'edge-d1') { x1 = -scaledCell / 2; y1 = scaledCell / 2; x2 = scaledCell / 2; y2 = -scaledCell / 2; }
              else if (el.type === 'edge-d2') { x1 = -scaledCell / 2; y1 = -scaledCell / 2; x2 = scaledCell / 2; y2 = scaledCell / 2; }

              if (isCartoon2) {
                // Marshmallow Candy Tube with Candy-Cane Spiral Stripes!
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 11 * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Base vibrant candy body
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = creature.color || '#ec4899';
                ctx.lineWidth = 7.5 * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Candy Cane White Spiral Dash Stripes
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 4 * currentZoom;
                ctx.lineCap = 'round';
                ctx.setLineDash([6 * currentZoom, 6 * currentZoom]);
                ctx.lineDashOffset = -now * 0.015;
                ctx.stroke();
                ctx.setLineDash([]);
              } else if (isCartoon1) {
                // Outer bold comic stroke
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 9.5 * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Inner candy color
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = creature.color || '#3b82f6';
                ctx.lineWidth = 6.2 * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                // Glossy reflection line
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
                ctx.lineWidth = 2 * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();
              } else {
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.strokeStyle = creature.color || '#3b82f6';
                ctx.lineWidth = (isGameTheme ? 7.5 : 3.5) * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                if (isGameTheme) {
                  ctx.beginPath();
                  ctx.moveTo(x1, y1);
                  ctx.lineTo(x2, y2);
                  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
                  ctx.lineWidth = 2.5 * currentZoom;
                  ctx.lineCap = 'round';
                  ctx.stroke();
                }
              }
            } else if (el.type.startsWith('muscle-')) {
              const isLeft = el.type.includes('left');
              const isRandom = el.type.includes('random');

              let isFlexed = false;
              let isJustFlexed = false;

              if (!isRandom) {
                isFlexed = isMuscleContracted;
                isJustFlexed = isMuscleContracted;
              } else {
                const mState = getRandomMuscleState(el, animStep);
                isFlexed = mState.isFlexed;
                isJustFlexed = mState.justFlexed;
              }

              const muscleFlexFactor = isRandom ? (isFlexed ? currentContractFactor : 0) : currentContractFactor;
              const flex = 1.2 - 0.6 * muscleFlexFactor;
              const sign = isLeft ? -1 : 1;

              if (isCartoon2) {
                // Cartoon 2: Rainbow Slinky Accordion Coil!
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(sign * 18 * currentZoom * flex, 11 * currentZoom, sign * 24 * currentZoom, 0);

                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = (isFlexed ? 7 : 5.2) * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(sign * 18 * currentZoom * flex, 11 * currentZoom, sign * 24 * currentZoom, 0);

                if (el.type === 'muscle-left') ctx.strokeStyle = '#f43f5e';
                else if (el.type === 'muscle-right') ctx.strokeStyle = '#a855f7';
                else if (el.type === 'muscle-random-left') ctx.strokeStyle = isFlexed ? '#facc15' : '#fb923c';
                else if (el.type === 'muscle-random-right') ctx.strokeStyle = isFlexed ? '#f472b6' : '#ec4899';

                ctx.lineWidth = (isFlexed ? 4.8 : 3.4) * currentZoom;
                ctx.stroke();

                // Vibration waves if muscle is flexed
                if (isFlexed) {
                  ctx.beginPath();
                  ctx.arc(sign * 14 * currentZoom * flex, 8 * currentZoom, 6 * currentZoom, 0, Math.PI * 2);
                  ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
                  ctx.lineWidth = 1.8 * currentZoom;
                  ctx.stroke();
                }

                if (isRandom && el.randomChance) {
                  ctx.fillStyle = '#0f172a';
                  ctx.font = `900 ${Math.max(9, 10 * currentZoom)}px "Comic Sans MS", system-ui, sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.fillText(`🎲${el.randomChance}%`, sign * 15 * currentZoom, 19 * currentZoom);
                }
              } else if (isCartoon1) {
                // Cartoon bouncy coiled spring!
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(sign * 16 * currentZoom * flex, 10 * currentZoom, sign * 22 * currentZoom, 0);

                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = (isFlexed ? 6 : 4.5) * currentZoom;
                ctx.lineCap = 'round';
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(sign * 16 * currentZoom * flex, 10 * currentZoom, sign * 22 * currentZoom, 0);

                if (el.type === 'muscle-left') ctx.strokeStyle = '#f43f5e';
                else if (el.type === 'muscle-right') ctx.strokeStyle = '#a855f7';
                else if (el.type === 'muscle-random-left') ctx.strokeStyle = isFlexed ? '#fbbf24' : '#f97316';
                else if (el.type === 'muscle-random-right') ctx.strokeStyle = isFlexed ? '#f472b6' : '#d946ef';

                ctx.lineWidth = (isFlexed ? 4 : 2.8) * currentZoom;
                ctx.stroke();

                if (isRandom && el.randomChance) {
                  ctx.fillStyle = '#0f172a';
                  ctx.font = `900 ${Math.max(9, 10 * currentZoom)}px "Comic Sans MS", system-ui, sans-serif`;
                  ctx.textAlign = 'center';
                  ctx.fillText(`🎲${el.randomChance}%`, sign * 14 * currentZoom, 18 * currentZoom);
                }
              } else {
                ctx.beginPath();
                ctx.moveTo(0, 0);
                ctx.quadraticCurveTo(sign * 14 * currentZoom * flex, 10 * currentZoom, sign * 20 * currentZoom, 0);

                if (el.type === 'muscle-left') ctx.strokeStyle = '#f43f5e';
                else if (el.type === 'muscle-right') ctx.strokeStyle = '#a855f7';
                else if (el.type === 'muscle-random-left') ctx.strokeStyle = isFlexed ? '#ff8c00' : '#f97316';
                else if (el.type === 'muscle-random-right') ctx.strokeStyle = isFlexed ? '#e024c3' : '#d946ef';

                ctx.lineWidth = (isFlexed ? 4.5 : 3) * currentZoom;
                if (isRandom) {
                  ctx.setLineDash([4 * currentZoom, 2 * currentZoom]);
                }
                ctx.stroke();
                ctx.setLineDash([]);

                if (isRandom && isJustFlexed) {
                  ctx.beginPath();
                  ctx.arc(sign * 12 * currentZoom, 4 * currentZoom, 5 * currentZoom, 0, Math.PI * 2);
                  ctx.fillStyle = isLeft ? '#ff8c00' : '#e024c3';
                  ctx.fill();
                }

                if (isRandom && el.randomChance) {
                  ctx.fillStyle = isFlexed ? '#ffffff' : (isLeft ? '#f97316' : '#d946ef');
                  ctx.font = `bold ${Math.max(8, 9 * currentZoom)}px monospace`;
                  ctx.textAlign = 'center';
                  ctx.fillText(`🎲${el.randomChance}%`, sign * 14 * currentZoom, 18 * currentZoom);
                }
              }
            }

            ctx.restore();
          });

          ctx.restore();

          // =========================================================================
          // INVULNERABILITY SHIELD & AURA EFFECTS (For all display modes!)
          // =========================================================================
          const isCreatureInvulnerable = Boolean(creature.isInvulnerable || (creature.invulnerableSec && creature.invulnerableSec > 0));
          if (isCreatureInvulnerable) {
            const invTime = creature.invulnerableSec ?? 10.0;
            const invProgress = Math.max(0, Math.min(1, invTime / 10.0));
            const pulse = 1 + Math.sin(now * 0.01) * 0.1;
            const shieldRadius = Math.max(36, 42 * currentZoom * pulse);

            ctx.save();
            ctx.translate(centerPos.x, centerPos.y);

            // Pulsing background shockwave ripple
            const rippleR = shieldRadius * (1 + ((now * 0.002) % 1) * 0.45);
            const rippleAlpha = Math.max(0, 0.45 * (1 - ((now * 0.002) % 1)));
            ctx.beginPath();
            ctx.arc(0, 0, rippleR, 0, Math.PI * 2);
            ctx.strokeStyle = isCartoon2
              ? `rgba(244, 114, 182, ${rippleAlpha})`
              : (currentGridTheme === 'game' || currentGridTheme === 'game-light' || currentGridTheme === 'dark')
              ? `rgba(0, 240, 255, ${rippleAlpha})`
              : `rgba(245, 158, 11, ${rippleAlpha})`;
            ctx.lineWidth = 3 * currentZoom;
            ctx.stroke();

            if (isCartoon2) {
              // --- CARTOON 2: RAINBOW COSMIC AURORA DOME + CANDY STARBURST ---
              const auroraGrad = ctx.createRadialGradient(0, 0, shieldRadius * 0.2, 0, 0, shieldRadius);
              auroraGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
              auroraGrad.addColorStop(0.35, 'rgba(244, 114, 182, 0.5)');
              auroraGrad.addColorStop(0.7, 'rgba(56, 189, 248, 0.55)');
              auroraGrad.addColorStop(1, 'rgba(250, 204, 21, 0.85)');

              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
              ctx.fillStyle = auroraGrad;
              ctx.fill();

              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
              ctx.strokeStyle = '#0f172a';
              ctx.lineWidth = 4 * currentZoom;
              ctx.stroke();

              const rainbowSegments = ['#f43f5e', '#fb923c', '#facc15', '#4ade80', '#38bdf8', '#a855f7'];
              const segAngle = (Math.PI * 2) / rainbowSegments.length;
              rainbowSegments.forEach((col, idx) => {
                const startA = idx * segAngle + now * 0.0035;
                const endA = startA + segAngle * 0.85;
                ctx.beginPath();
                ctx.arc(0, 0, shieldRadius, startA, endA);
                ctx.strokeStyle = col;
                ctx.lineWidth = 3.5 * currentZoom;
                ctx.stroke();
              });

              // Orbiting starbursts
              const numStars = 6;
              for (let s = 0; s < numStars; s++) {
                const starAngle = (s * Math.PI * 2) / numStars + now * 0.005;
                const starDist = shieldRadius + 7 * currentZoom * Math.sin(now * 0.012 + s);
                const sx = Math.cos(starAngle) * starDist;
                const sy = Math.sin(starAngle) * starDist;

                ctx.save();
                ctx.translate(sx, sy);
                ctx.rotate(starAngle + now * 0.015);
                const sr = 7 * currentZoom;
                ctx.beginPath();
                for (let k = 0; k < 5; k++) {
                  const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
                  const innerA = a + Math.PI / 5;
                  if (k === 0) ctx.moveTo(Math.cos(a) * sr, Math.sin(a) * sr);
                  else ctx.lineTo(Math.cos(a) * sr, Math.sin(a) * sr);
                  ctx.lineTo(Math.cos(innerA) * (sr * 0.45), Math.sin(innerA) * (sr * 0.45));
                }
                ctx.closePath();
                ctx.fillStyle = s % 2 === 0 ? '#facc15' : '#38bdf8';
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.5 * currentZoom;
                ctx.stroke();
                ctx.restore();
              }

              // Outer timer ring
              const startArc = -Math.PI / 2;
              const endArc = startArc + Math.PI * 2 * invProgress;
              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius + 8 * currentZoom, startArc, endArc);
              ctx.strokeStyle = '#facc15';
              ctx.lineWidth = 4.5 * currentZoom;
              ctx.lineCap = 'round';
              ctx.stroke();

            } else if (isCartoon1) {
              // --- CARTOON 1: SOAP BUBBLE SHIELD + ANGEL HALO ---
              const bubbleGrad = ctx.createRadialGradient(-shieldRadius * 0.3, -shieldRadius * 0.3, shieldRadius * 0.1, 0, 0, shieldRadius);
              bubbleGrad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
              bubbleGrad.addColorStop(0.4, 'rgba(251, 191, 36, 0.4)');
              bubbleGrad.addColorStop(0.85, 'rgba(245, 158, 11, 0.65)');
              bubbleGrad.addColorStop(1, 'rgba(217, 119, 6, 0.85)');

              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
              ctx.fillStyle = bubbleGrad;
              ctx.fill();
              ctx.strokeStyle = '#b45309';
              ctx.lineWidth = 3 * currentZoom;
              ctx.stroke();

              // Specular gloss glints
              ctx.beginPath();
              ctx.ellipse(-shieldRadius * 0.4, -shieldRadius * 0.4, shieldRadius * 0.28, shieldRadius * 0.14, -Math.PI / 4, 0, Math.PI * 2);
              ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
              ctx.fill();

              // Angel crown halo rotating above
              ctx.save();
              ctx.translate(0, -shieldRadius - 10 * currentZoom);
              ctx.beginPath();
              ctx.ellipse(0, 0, 20 * currentZoom, 7 * currentZoom, 0, 0, Math.PI * 2);
              ctx.strokeStyle = '#facc15';
              ctx.lineWidth = 4 * currentZoom;
              ctx.shadowColor = '#fbbf24';
              ctx.shadowBlur = 14 * currentZoom;
              ctx.stroke();
              ctx.restore();

              // Timer Arc
              const startArc = -Math.PI / 2;
              const endArc = startArc + Math.PI * 2 * invProgress;
              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius + 6 * currentZoom, startArc, endArc);
              ctx.strokeStyle = '#fbbf24';
              ctx.lineWidth = 4 * currentZoom;
              ctx.lineCap = 'round';
              ctx.stroke();

            } else if (currentGridTheme === 'game' || currentGridTheme === 'game-light' || currentGridTheme === 'dark') {
              // --- GAME / CYBER: HOLOGRAPHIC HEXAGONAL FORCE FIELD ---
              const cyberGrad = ctx.createRadialGradient(0, 0, shieldRadius * 0.15, 0, 0, shieldRadius);
              cyberGrad.addColorStop(0, 'rgba(6, 182, 212, 0.25)');
              cyberGrad.addColorStop(0.65, 'rgba(14, 165, 233, 0.45)');
              cyberGrad.addColorStop(0.9, 'rgba(6, 182, 212, 0.85)');
              cyberGrad.addColorStop(1, 'rgba(255, 255, 255, 0.95)');

              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
              ctx.fillStyle = cyberGrad;
              ctx.fill();

              // Rotating outer hexagon
              const hexSides = 6;
              const hexAngleOffset = now * 0.002;
              ctx.beginPath();
              for (let h = 0; h <= hexSides; h++) {
                const ha = (h * Math.PI * 2) / hexSides + hexAngleOffset;
                const hx = Math.cos(ha) * shieldRadius;
                const hy = Math.sin(ha) * shieldRadius;
                if (h === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
              ctx.strokeStyle = '#00f0ff';
              ctx.lineWidth = 3.2 * currentZoom;
              ctx.shadowColor = '#00f0ff';
              ctx.shadowBlur = 16 * currentZoom;
              ctx.stroke();

              // Inner counter-rotating hexagon
              ctx.beginPath();
              for (let h = 0; h <= hexSides; h++) {
                const ha = (h * Math.PI * 2) / hexSides - hexAngleOffset * 1.6;
                const hx = Math.cos(ha) * (shieldRadius * 0.72);
                const hy = Math.sin(ha) * (shieldRadius * 0.72);
                if (h === 0) ctx.moveTo(hx, hy);
                else ctx.lineTo(hx, hy);
              }
              ctx.strokeStyle = '#ffb703';
              ctx.lineWidth = 2.2 * currentZoom;
              ctx.shadowColor = '#ffaa00';
              ctx.shadowBlur = 10 * currentZoom;
              ctx.stroke();

              // Rotating energy arcs / laser filaments
              ctx.beginPath();
              for (let a = 0; a < 4; a++) {
                const arcA = a * (Math.PI / 2) + now * 0.003;
                ctx.arc(0, 0, shieldRadius * 0.88, arcA, arcA + Math.PI / 4);
              }
              ctx.strokeStyle = '#ffffff';
              ctx.lineWidth = 2 * currentZoom;
              ctx.stroke();

              // Orbiting plasma nodes
              const nodeCount = 4;
              for (let n = 0; n < nodeCount; n++) {
                const na = (n * Math.PI * 2) / nodeCount + now * 0.004;
                const nx = Math.cos(na) * shieldRadius;
                const ny = Math.sin(na) * shieldRadius;

                ctx.beginPath();
                ctx.arc(nx, ny, 4 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = 14 * currentZoom;
                ctx.fill();
              }

              // Timer Arc
              const startArc = -Math.PI / 2;
              const endArc = startArc + Math.PI * 2 * invProgress;
              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius + 7 * currentZoom, startArc, endArc);
              ctx.strokeStyle = '#00f0ff';
              ctx.lineWidth = 4 * currentZoom;
              ctx.lineCap = 'round';
              ctx.stroke();

            } else {
              // --- NOTEBOOK / DRAWING / PAINTING / PAPER / BLUEPRINT ---
              const paintGrad = ctx.createRadialGradient(0, 0, shieldRadius * 0.3, 0, 0, shieldRadius);
              paintGrad.addColorStop(0, 'rgba(254, 240, 138, 0.45)');
              paintGrad.addColorStop(0.65, 'rgba(245, 158, 11, 0.4)');
              paintGrad.addColorStop(1, 'rgba(217, 119, 6, 0.7)');

              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
              ctx.fillStyle = paintGrad;
              ctx.fill();

              // Sketched calligraphic pencil stroke halo with organic hand-drawn wobble
              ctx.beginPath();
              const points = 36;
              for (let p = 0; p <= points; p++) {
                const pa = (p * Math.PI * 2) / points;
                const wobble = Math.sin(pa * 6 + now * 0.004) * (2.8 * currentZoom);
                const pr = shieldRadius + wobble;
                const px = Math.cos(pa) * pr;
                const py = Math.sin(pa) * pr;
                if (p === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
              }
              ctx.strokeStyle = currentGridTheme === 'blueprint' ? '#38bdf8' : '#d97706';
              ctx.lineWidth = 3.2 * currentZoom;
              ctx.stroke();

              // Sketched cross-hatching pencil lines along rim
              ctx.save();
              ctx.strokeStyle = currentGridTheme === 'blueprint' ? 'rgba(56, 189, 248, 0.6)' : 'rgba(217, 119, 6, 0.65)';
              ctx.lineWidth = 1.5 * currentZoom;
              for (let h = 0; h < 12; h++) {
                const ha = (h * Math.PI * 2) / 12 + now * 0.001;
                const r1 = shieldRadius - 7 * currentZoom;
                const r2 = shieldRadius + 7 * currentZoom;
                ctx.beginPath();
                ctx.moveTo(Math.cos(ha) * r1, Math.sin(ha) * r1);
                ctx.lineTo(Math.cos(ha + 0.15) * r2, Math.sin(ha + 0.15) * r2);
                ctx.stroke();
              }
              ctx.restore();

              // Orbiting sketched golden runic seals
              const runes = 4;
              for (let r = 0; r < runes; r++) {
                const ra = (r * Math.PI * 2) / runes + now * 0.003;
                const rx = Math.cos(ra) * (shieldRadius + 5 * currentZoom);
                const ry = Math.sin(ra) * (shieldRadius + 5 * currentZoom);
                ctx.beginPath();
                ctx.arc(rx, ry, 4.5 * currentZoom, 0, Math.PI * 2);
                ctx.fillStyle = currentGridTheme === 'blueprint' ? '#7dd3fc' : '#fbbf24';
                ctx.fill();
                ctx.strokeStyle = '#0f172a';
                ctx.lineWidth = 1.4 * currentZoom;
                ctx.stroke();
              }

              // Timer Arc
              const startArc = -Math.PI / 2;
              const endArc = startArc + Math.PI * 2 * invProgress;
              ctx.beginPath();
              ctx.arc(0, 0, shieldRadius + 6 * currentZoom, startArc, endArc);
              ctx.strokeStyle = currentGridTheme === 'blueprint' ? '#38bdf8' : '#d97706';
              ctx.lineWidth = 3.5 * currentZoom;
              ctx.lineCap = 'round';
              ctx.stroke();
            }

            // =========================================================================
            // PROMINENT LIVE COUNTDOWN TIMER BADGE ON TOP OF SHIELD
            // =========================================================================
            const badgeSeconds = invTime > 0 ? invTime.toFixed(1) : '0.0';
            const countdownText = `🛡️ ${badgeSeconds}s`;
            ctx.font = `900 ${Math.max(12, 14 * currentZoom)}px system-ui, -apple-system, sans-serif`;
            const countW = ctx.measureText(countdownText).width;
            const badgeW = countW + 16 * currentZoom;
            const badgeH = 24 * currentZoom;
            const badgeTopY = -shieldRadius - 16 * currentZoom - badgeH;

            // Pulsing glow behind badge
            ctx.save();
            ctx.fillStyle = isCartoon2
              ? '#f43f5e'
              : (currentGridTheme === 'game' || currentGridTheme === 'game-light' || currentGridTheme === 'dark')
              ? '#00f0ff'
              : '#f59e0b';
            ctx.shadowColor = ctx.fillStyle;
            ctx.shadowBlur = 12 * currentZoom;
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2, badgeTopY, badgeW, badgeH, 8 * currentZoom);
            } else {
              ctx.rect(-badgeW / 2, badgeTopY, badgeW, badgeH);
            }
            ctx.fill();

            // Inner dark badge fill
            ctx.fillStyle = '#0f172a';
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2 + 1.5, badgeTopY + 1.5, badgeW - 3, badgeH - 3, 7 * currentZoom);
            } else {
              ctx.rect(-badgeW / 2 + 1.5, badgeTopY + 1.5, badgeW - 3, badgeH - 3);
            }
            ctx.fill();

            // Render live countdown text
            ctx.fillStyle = '#facc15';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(countdownText, 0, badgeTopY + badgeH / 2);
            ctx.restore();

            ctx.restore();
          }

          // --- TEXTUAL HUD OVERLAY OVER CREATURE ---
          ctx.save();
          ctx.translate(centerPos.x, centerPos.y);

          // Calculate stable upper bounding boundary of all rotated body elements
          const rotRad = (rotationDelta * Math.PI) / 180;
          const cosR = Math.cos(rotRad);
          const sinR = Math.sin(rotRad);

          let targetMinRelY = -28 * currentZoom;

          creature.elements.forEach((el) => {
            const elX = el.relX * scaledCell;
            const elY = el.relY * scaledCell;
            const screenY = elX * sinR + elY * cosR;

            let elemHalfSize = 16 * currentZoom;
            if (el.type.startsWith('edge-') || el.type.startsWith('muscle-')) {
              elemHalfSize = Math.max(22 * currentZoom, scaledCell * 0.72);
            } else if (el.type === 'head') {
              elemHalfSize = 18 * currentZoom;
            } else if (el.type === 'joint') {
              elemHalfSize = 14 * currentZoom;
            }

            const topPoint = screenY - elemHalfSize;
            if (topPoint < targetMinRelY) {
              targetMinRelY = topPoint;
            }
          });

          if (isSelected) {
            targetMinRelY = Math.min(targetMinRelY, -40 * currentZoom);
          }
          if (isDashing) {
            targetMinRelY = Math.min(targetMinRelY, -44 * currentZoom);
          }

          const prevSmoothedY = smoothedHudYRef.current.get(creature.id) ?? targetMinRelY;
          const hudSmoothingFactor = 1 - Math.exp(-16 * dt);
          const smoothedMinRelY = prevSmoothedY + (targetMinRelY - prevSmoothedY) * hudSmoothingFactor;
          smoothedHudYRef.current.set(creature.id, smoothedMinRelY);

          const safeTopY = smoothedMinRelY - 8 * currentZoom;
          const energyBarY = safeTopY - 4 * currentZoom;

          const f = creature.forces;
          const boostMultiplier = isDashing ? 1.6 : 1.0;
          const currentDisplaySpeed = (f.forwardSpeed * boostMultiplier).toFixed(2);
          const isCreatureBraking = creature.isBraking || creature.state === 'braking' || (isSelected && isBrakingRef.current);

          if (isCartoon2) {
            // --- CARTOON 2: CANDY PARTY BANNER HUD ---
            const brakeTag = isCreatureBraking ? ' 🛑[СТОП]' : '';
            const invTag = isCreatureInvulnerable ? ` 🛡️[ЩИТ ${(creature.invulnerableSec || 10).toFixed(1)}с]` : '';
            const sleepTag = creature.isSleeping && !isCreatureBraking ? ' 💤' : '';
            const baseTag = creature.inBase ? ' 🏰[ДОМИК]' : '';
            const titleText = `🦄 ${creature.name}${brakeTag}${invTag}${sleepTag}${baseTag}`;
            const speedStr = isCreatureBraking
              ? '🛑 ТОРМОЗ'
              : isDashing
              ? `🚀 ${currentDisplaySpeed} (TURBO!)`
              : `Скор: ${currentDisplaySpeed}`;
            const bankStr = creature.inBase ? ` (🏦 ${creature.bankFood || 0})` : '';
            const statsText = `Вес: ${f.totalMass.toFixed(1)}  •  ${speedStr}  •  🍩 ${creature.foodEaten || 0}${bankStr}`;

            ctx.font = `900 ${Math.max(11, 13 * currentZoom)}px "Comic Sans MS", "Arial Black", system-ui, sans-serif`;
            const titleW = ctx.measureText(titleText).width;
            ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px system-ui, sans-serif`;
            const statsW = ctx.measureText(statsText).width;

            const badgeW = Math.max(titleW, statsW) + 26 * currentZoom;
            const badgeH = 38 * currentZoom;
            const badgeY = energyBarY - 6 * currentZoom - badgeH;

            // Rainbow bordered speech bubble cloud
            ctx.fillStyle = '#ffffff';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 3 * currentZoom;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 12 * currentZoom);
            } else {
              ctx.rect(-badgeW / 2, badgeY, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            // Festive Candy Ribbon at top of bubble
            ctx.save();
            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2 + 2, badgeY + 2, badgeW - 4, 6 * currentZoom, [10 * currentZoom, 10 * currentZoom, 0, 0]);
            } else {
              ctx.rect(-badgeW / 2 + 2, badgeY + 2, badgeW - 4, 6 * currentZoom);
            }
            ctx.fillStyle = '#ec4899';
            ctx.fill();
            ctx.restore();

            // Speech bubble tail
            ctx.beginPath();
            ctx.moveTo(-5 * currentZoom, badgeY + badgeH);
            ctx.lineTo(0, badgeY + badgeH + 5 * currentZoom);
            ctx.lineTo(5 * currentZoom, badgeY + badgeH);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Title Text
            ctx.fillStyle = isCreatureBraking ? '#f43f5e' : (creature.inBase ? '#db2777' : '#0f172a');
            ctx.font = `900 ${Math.max(11, 13 * currentZoom)}px "Comic Sans MS", "Arial Black", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(titleText, 0, badgeY + 6 * currentZoom);

            // Stats Text
            ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px system-ui, sans-serif`;
            ctx.fillStyle = isCreatureBraking ? '#e11d48' : (isDashing ? '#ea580c' : '#7c3aed');
            ctx.fillText(statsText, 0, badgeY + 22 * currentZoom);
          } else if (isCartoon1) {
            // --- CARTOON 1 SPEECH BUBBLE CLOUD HUD ---
            const brakeTag = isCreatureBraking ? ' 🛑[СТОП]' : '';
            const invTag = isCreatureInvulnerable ? ` 🛡️[ЩИТ ${(creature.invulnerableSec || 10).toFixed(1)}с]` : '';
            const sleepTag = creature.isSleeping && !isCreatureBraking ? ' 💤' : '';
            const baseTag = creature.inBase ? ' 🏰[ДОМИК]' : '';
            const titleText = `🦄 ${creature.name}${brakeTag}${invTag}${sleepTag}${baseTag}`;
            const speedStr = isCreatureBraking
              ? '🛑 ТОРМОЗ'
              : isDashing
              ? `🚀 ${currentDisplaySpeed} (BOOST!)`
              : `Скор: ${currentDisplaySpeed}`;
            const bankStr = creature.inBase ? ` (🏦 ${creature.bankFood || 0})` : '';
            const statsText = `Вес: ${f.totalMass.toFixed(1)}  •  ${speedStr}  •  🍓 ${creature.foodEaten || 0}${bankStr}`;

            ctx.font = `900 ${Math.max(11, 13 * currentZoom)}px "Comic Sans MS", "Arial Black", system-ui, sans-serif`;
            const titleW = ctx.measureText(titleText).width;
            ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px system-ui, sans-serif`;
            const statsW = ctx.measureText(statsText).width;

            const badgeW = Math.max(titleW, statsW) + 24 * currentZoom;
            const badgeH = 36 * currentZoom;
            const badgeY = energyBarY - 6 * currentZoom - badgeH;

            // Speech Bubble Cloud Background
            ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            ctx.strokeStyle = '#0f172a';
            ctx.lineWidth = 2.5 * currentZoom;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 10 * currentZoom);
            } else {
              ctx.rect(-badgeW / 2, badgeY, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            // Speech bubble tail
            ctx.beginPath();
            ctx.moveTo(-4 * currentZoom, badgeY + badgeH);
            ctx.lineTo(0, badgeY + badgeH + 4 * currentZoom);
            ctx.lineTo(4 * currentZoom, badgeY + badgeH);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            // Title Text
            ctx.fillStyle = isCreatureBraking ? '#f43f5e' : (creature.inBase ? '#db2777' : '#0f172a');
            ctx.font = `900 ${Math.max(11, 13 * currentZoom)}px "Comic Sans MS", "Arial Black", system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(titleText, 0, badgeY + 4 * currentZoom);

            // Stats Text
            ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px system-ui, sans-serif`;
            ctx.fillStyle = isCreatureBraking ? '#e11d48' : (isDashing ? '#ea580c' : '#7c3aed');
            ctx.fillText(statsText, 0, badgeY + 20 * currentZoom);
          } else if (isGameTheme) {
            // Game Mode HUD Badge: Displays Creature Name, Mass, Speed and Food Count
            const brakeTag = isCreatureBraking ? ' 🛑[СТОП]' : '';
            const invTag = isCreatureInvulnerable ? ` 🛡️[ЩИТ ${(creature.invulnerableSec || 10).toFixed(1)}с]` : '';
            const sleepTag = creature.isSleeping && !isCreatureBraking ? ' 💤' : '';
            const baseTag = creature.inBase ? ' 🛡️[БАЗА]' : '';
            const titleText = `🐍 ${creature.name}${brakeTag}${invTag}${sleepTag}${baseTag}`;
            const speedStr = isCreatureBraking
              ? '🛑 НЕЙТРАЛЬ (N)'
              : isDashing
              ? `⚡ ${currentDisplaySpeed} (1.6x)`
              : `Скор: ${currentDisplaySpeed}`;
            const bankStr = creature.inBase ? ` (Банк: ${creature.bankFood || 0})` : '';
            const statsText = `Масса: ${f.totalMass.toFixed(1)}  •  ${speedStr}  •  Еда: ${creature.foodEaten || 0}${bankStr}`;

            ctx.font = `bold ${Math.max(11, 12.5 * currentZoom)}px system-ui, sans-serif`;
            const titleW = ctx.measureText(titleText).width;
            ctx.font = `bold ${Math.max(9, 10 * currentZoom)}px monospace`;
            const statsW = ctx.measureText(statsText).width;

            const badgeW = Math.max(titleW, statsW) + 20 * currentZoom;
            const badgeH = 34 * currentZoom;
            const badgeY = energyBarY - 6 * currentZoom - badgeH;

            ctx.fillStyle = currentGridTheme === 'game-light' ? 'rgba(255, 255, 255, 0.94)' : 'rgba(15, 23, 42, 0.92)';
            ctx.strokeStyle = isCreatureBraking ? '#f43f5e' : (creature.inBase ? '#10b981' : (isDashing ? '#f59e0b' : (creature.isSleeping ? '#94a3b8' : (creature.color || '#ec4899'))));
            ctx.lineWidth = (isCreatureBraking || creature.inBase || isDashing ? 2.5 : 1.5) * currentZoom;

            ctx.beginPath();
            if (typeof ctx.roundRect === 'function') {
              ctx.roundRect(-badgeW / 2, badgeY, badgeW, badgeH, 8 * currentZoom);
            } else {
              ctx.rect(-badgeW / 2, badgeY, badgeW, badgeH);
            }
            ctx.fill();
            ctx.stroke();

            // Creature Name
            ctx.fillStyle = isCreatureBraking ? '#fb7185' : (creature.inBase ? '#34d399' : (currentGridTheme === 'game-light' ? '#0f172a' : '#ffffff'));
            ctx.font = `bold ${Math.max(11, 12.5 * currentZoom)}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(titleText, 0, badgeY + 4 * currentZoom);

            // Mass, Speed, Food Count
            ctx.font = `bold ${Math.max(9, 10 * currentZoom)}px monospace`;
            ctx.fillStyle = isCreatureBraking ? '#fb7185' : (isDashing ? '#f59e0b' : (currentGridTheme === 'game-light' ? '#334155' : '#38bdf8'));
            ctx.fillText(statsText, 0, badgeY + 19 * currentZoom);
          } else {
            // Notebook / Blueprint / Dark / Paper HUD
            const statsY = energyBarY - 6 * currentZoom;
            const nameY = statsY - 14 * currentZoom;

            const speedLabel = isCreatureBraking ? '🛑СТОП [N]' : (isDashing ? `v:${currentDisplaySpeed} ⚡x1.6` : `v:${currentDisplaySpeed}`);
            const baseTag = creature.inBase ? ' 🛡️[БАЗА]' : '';
            const brakeTag = isCreatureBraking ? ' 🛑[СТОП]' : '';
            const invTag = isCreatureInvulnerable ? ` 🛡️[ЩИТ ${(creature.invulnerableSec || 10).toFixed(1)}с]` : '';
            ctx.font = `bold ${Math.max(9, 10.5 * currentZoom)}px monospace`;
            ctx.fillStyle = isCreatureBraking ? '#f43f5e' : (isDashing ? '#f59e0b' : (creature.inBase ? '#10b981' : '#38bdf8'));
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(
              `m:${f.totalMass.toFixed(1)} | I:${f.totalInertia?.toFixed(1) ?? '1.0'} | ${speedLabel} | 🍎${creature.foodEaten || 0}${creature.inBase ? ` 🏦${creature.bankFood || 0}` : ''}`,
              0,
              statsY
            );

            ctx.fillStyle = isCreatureBraking ? '#f43f5e' : (creature.inBase ? '#10b981' : mainInkColor);
            ctx.font = `bold ${Math.max(11, 13 * currentZoom)}px system-ui, sans-serif`;
            const sleepTag = creature.isSleeping && !isCreatureBraking ? ' 💤' : '';
            ctx.fillText(`${creature.name}${brakeTag}${invTag}${sleepTag}${baseTag}`, 0, nameY);
          }

          // Energy Bar
          const energyPct = Math.max(0, creature.energy / creature.maxEnergy);
          const barW = 36 * currentZoom;
          const barH = 4.5 * currentZoom;
          ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
          ctx.beginPath();
          if (typeof ctx.roundRect === 'function') {
            ctx.roundRect(-barW / 2, energyBarY, barW, barH, 2 * currentZoom);
            ctx.fill();
            ctx.fillStyle = energyPct > 0.4 ? '#10b981' : '#f43f5e';
            ctx.beginPath();
            ctx.roundRect(-barW / 2, energyBarY, barW * energyPct, barH, 2 * currentZoom);
            ctx.fill();
          } else {
            ctx.fillRect(-barW / 2, energyBarY, barW, barH);
            ctx.fillStyle = energyPct > 0.4 ? '#10b981' : '#f43f5e';
            ctx.fillRect(-barW / 2, energyBarY, barW * energyPct, barH);
          }

          ctx.restore();
        });
      });

      // Render Ghost Preview during Placement Mode
      const activeHoverGridPos = hoverGridPosRef.current;
      if (currentPendingPlacement && activeHoverGridPos) {
        const centerPos = {
          x: currentOffset.x + activeHoverGridPos.x * scaledCell,
          y: currentOffset.y + activeHoverGridPos.y * scaledCell,
        };
        const baseHeadAngle = determineCreatureHeadAngle(currentPendingPlacement.elements);
        const rotationDelta = currentPendingPlacement.angleDeg - baseHeadAngle;

        ctx.save();
        ctx.translate(centerPos.x, centerPos.y);

        const pulse = Math.sin(Date.now() / 150) * 4;
        ctx.beginPath();
        ctx.arc(0, 0, (28 + pulse) * currentZoom, 0, Math.PI * 2);
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 3 * currentZoom;
        ctx.setLineDash([8 * currentZoom, 4 * currentZoom]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(0, 0, 8 * currentZoom, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(99, 102, 241, 0.4)';
        ctx.fill();

        ctx.rotate((rotationDelta * Math.PI) / 180);
        ctx.globalAlpha = 0.75;

        currentPendingPlacement.elements.forEach((el) => {
          const elX = el.relX * scaledCell;
          const elY = el.relY * scaledCell;

          ctx.save();
          ctx.translate(elX, elY);

          if (el.type === 'head') {
            ctx.beginPath();
            ctx.arc(0, 0, 11 * currentZoom, 0, Math.PI * 2);
            ctx.fillStyle = '#fef08a';
            ctx.fill();
            ctx.strokeStyle = '#eab308';
            ctx.lineWidth = 2.5 * currentZoom;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 0, 4.5 * currentZoom, 0, Math.PI * 2);
            ctx.fillStyle = '#0f172a';
            ctx.fill();
          } else if (el.type === 'joint') {
            ctx.beginPath();
            ctx.arc(0, 0, 8 * currentZoom, 0, Math.PI * 2);
            ctx.fillStyle = '#1e293b';
            ctx.fill();
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 2.5 * currentZoom;
            ctx.stroke();
          } else if (el.type.startsWith('edge-')) {
            ctx.beginPath();
            ctx.moveTo(-scaledCell / 2, 0);
            ctx.lineTo(scaledCell / 2, 0);
            ctx.strokeStyle = currentPendingPlacement.color || '#6366f1';
            ctx.lineWidth = 3.5 * currentZoom;
            ctx.stroke();
          } else if (el.type.startsWith('muscle-')) {
            const isLeft = el.type.includes('left');
            const sign = isLeft ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.quadraticCurveTo(sign * 14 * currentZoom, 10 * currentZoom, sign * 20 * currentZoom, 0);
            ctx.strokeStyle = el.type.includes('random') ? (isLeft ? '#f97316' : '#d946ef') : (isLeft ? '#f43f5e' : '#a855f7');
            ctx.lineWidth = 3 * currentZoom;
            if (el.type.includes('random')) ctx.setLineDash([4 * currentZoom, 2 * currentZoom]);
            ctx.stroke();
            ctx.setLineDash([]);
          }

          ctx.restore();
        });

        ctx.restore();

        ctx.save();
        ctx.translate(centerPos.x, centerPos.y);
        ctx.fillStyle = '#6366f1';
        ctx.font = `bold ${Math.max(10, 12 * currentZoom)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText(`Нажмите для размещения (${currentPendingPlacement.angleDeg}°)`, 0, -36 * currentZoom);
        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animationFrameId);
  }, [halfWorld, worldSize]);

  return (
    <div className="relative w-full h-full overflow-hidden select-none bg-slate-950 cursor-crosshair">
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onContextMenu={handleContextMenu}
        className="block w-full h-full"
      />

      {/* Top Banner overlay during Placement Mode */}
      {pendingPlacement && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-slate-900/95 border border-indigo-500/60 rounded-2xl p-3 shadow-2xl backdrop-blur-md flex flex-col md:flex-row items-center gap-3 text-xs text-slate-100 animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-indigo-500 animate-ping" />
            <span className="font-bold text-indigo-300">РАЗМЕЩЕНИЕ:</span>
            <span className="font-semibold text-slate-100">"{pendingPlacement.name}"</span>
          </div>

          {/* Orientation Angle selector buttons */}
          <div className="flex items-center gap-1 bg-slate-800/90 p-1 rounded-xl border border-slate-700/80">
            <Compass className="w-3.5 h-3.5 text-indigo-400 ml-1 mr-0.5" />
            {[270, 0, 90, 180, 315, 45, 135, 225].map((angle) => {
              const labelMap: Record<number, string> = {
                270: '↑ 270°',
                0: '→ 0°',
                90: '↓ 90°',
                180: '← 180°',
                315: '↗ 315°',
                45: '↘ 45°',
                135: '↙ 135°',
                225: '↖ 225°',
              };
              return (
                <button
                  key={angle}
                  onClick={() => onChangePlacementAngle(angle)}
                  className={`px-2 py-1 rounded-lg text-2xs font-bold transition ${
                    pendingPlacement.angleDeg === angle
                      ? 'bg-indigo-600 text-white shadow-md'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  {labelMap[angle] || `${angle}°`}
                </button>
              );
            })}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => onChangePlacementAngle((pendingPlacement.angleDeg + 45) % 360)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl border border-slate-700 transition text-2xs font-bold flex items-center gap-1"
              title="Повернуть на 45° (Клавиша R)"
            >
              <RotateCw className="w-3 h-3 text-indigo-400" />
              <span>Поворот (R)</span>
            </button>
            <button
              onClick={onCancelPlacement}
              className="px-2.5 py-1 bg-red-950/80 hover:bg-red-900 text-red-200 rounded-xl border border-red-800/60 transition text-2xs font-bold flex items-center gap-1"
            >
              <X className="w-3 h-3" />
              <span>Отмена</span>
            </button>
          </div>
        </div>
      )}

      {/* Floating Canvas Hint overlay */}
      {!isHintHidden && (
        <div className="absolute bottom-4 left-4 z-20 text-xs bg-slate-900/90 backdrop-blur-md px-3.5 py-2 rounded-xl border border-slate-800 shadow-xl text-slate-300 flex items-center gap-3">
          {pendingPlacement ? (
            <span className="font-bold text-indigo-400">🎯 Нажмите ЛКМ на сетке для выбора позиции. Зажмите ПКМ для панорамы или клавишу 'R' для поворота!</span>
          ) : (
            <>
              <span>🖱️ ЛКМ: Выбрать / Добавить еду</span>
              <span className="text-slate-600">•</span>
              <span>🚀 Пробел (Space): Рывок x1.6 (требуется еда &gt; 0, расход 2 ед/сек)</span>
              <span className="text-slate-600">•</span>
              <span>A / D или (← / →): Поворот на 10°</span>
            </>
          )}
          <button
            onClick={() => setIsHintHidden(true)}
            className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition ml-1 cursor-pointer"
            title="Скрыть подсказку"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Bottom Right Controls Stack (Player Creature Control HUD + Zoom Toolbar) */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col items-end gap-2 max-w-[calc(100vw-2rem)]">
        {/* Player Control HUD Widget */}
        {onTurnPlayer && (() => {
          const activeControlCreature = creatures.find((c) => c.id === selectedCreatureId) || creatures[0];
          const activeMass = activeControlCreature?.forces?.totalMass?.toFixed(1) ?? '1.0';
          const baseSpeed = activeControlCreature?.forces?.forwardSpeed ?? 0.22;
          const activeFood = activeControlCreature?.foodEaten ?? 0;
          const hasFood = activeFood > 0;
          const isActuallyDashing = isSpacePressed && hasFood;
          const liveSpeed = (baseSpeed * (isActuallyDashing ? 1.6 : 1.0)).toFixed(2);

          return isPlayerHudCollapsed ? (
            <button
              onClick={() => setIsPlayerHudCollapsed(false)}
              className="flex items-center gap-2 px-3 py-2 bg-slate-900/90 backdrop-blur-md rounded-2xl border border-indigo-500/50 text-indigo-400 hover:bg-slate-800 transition shadow-xl text-xs font-bold cursor-pointer"
              title="Показать панель управления чудиком"
            >
              <Gamepad2 className="w-4 h-4 text-indigo-400" />
              <span className="hidden sm:inline">Управление</span>
              <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 bg-slate-900/95 backdrop-blur-md p-2.5 rounded-2xl border border-indigo-500/50 shadow-2xl text-xs text-slate-100 animate-in fade-in min-w-[230px]">
              <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 px-0.5">
                <div className="flex items-center gap-1.5 text-indigo-400 font-bold">
                  <Gamepad2 className="w-4 h-4 text-indigo-400" />
                  <span>Управление</span>
                </div>
                <div className="flex items-center gap-1">
                  {selectedCreatureName && (
                    <span className="text-2xs text-slate-300 max-w-[100px] truncate font-semibold">
                      {selectedCreatureName}
                    </span>
                  )}
                  <button
                    onClick={() => setIsPlayerHudCollapsed(true)}
                    className="p-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                    title="Скрыть панель управления"
                  >
                    <ChevronDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Live Telemetry Row: Mass, Speed (with dynamic 1.6x multiplier or Brake indicator), Food */}
              <div className="flex items-center justify-between gap-1 px-2 py-1 bg-slate-800/80 rounded-xl border border-slate-700/60 font-mono text-[11px]">
                <div className="flex items-center gap-1 text-slate-300" title="Масса чудика">
                  <span className="text-indigo-400 font-semibold">M:</span>
                  <span>{activeMass}</span>
                </div>
                <div className="w-px h-3 bg-slate-700" />
                <div className={`flex items-center gap-1 transition-colors ${isBraking ? 'text-rose-400 font-bold' : isActuallyDashing ? 'text-amber-300 font-bold' : 'text-emerald-400'}`} title={isBraking ? 'Тормоз (Нейтраль) включен' : 'Текущая скорость движения'}>
                  <span>{isBraking ? '🛑' : isActuallyDashing ? '⚡' : 'V:'}</span>
                  <span>{isBraking ? 'СТОП' : liveSpeed}</span>
                  {isActuallyDashing && !isBraking && <span className="text-[9px] text-amber-400 font-bold">x1.6</span>}
                </div>
                <div className="w-px h-3 bg-slate-700" />
                <div className={`flex items-center gap-1 ${hasFood ? 'text-amber-300' : 'text-red-400'}`} title="Количество съеденной еды">
                  <span>🍎</span>
                  <span className="font-bold">{activeFood}</span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 pt-0.5">
                <button
                  onClick={() => onTurnPlayer?.('left')}
                  className="flex-1 py-1.5 px-2 bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/50 rounded-xl font-bold flex items-center justify-center gap-1 transition text-xs active:scale-95 shadow-md cursor-pointer"
                  title="Повернуть влево на 10° (Стрелка влево ← или A)"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>← 10°</span>
                </button>

                <button
                  onClick={() => onTurnPlayer?.('right')}
                  className="flex-1 py-1.5 px-2 bg-indigo-600/30 hover:bg-indigo-600/60 text-indigo-200 border border-indigo-500/50 rounded-xl font-bold flex items-center justify-center gap-1 transition text-xs active:scale-95 shadow-md cursor-pointer"
                  title="Повернуть вправо на 10° (Стрелка вправо → или D)"
                >
                  <span>10° →</span>
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Invulnerability Shield Action Button (50 gold, 10s, V key) */}
              {onActivateInvulnerability && (
                <div className="pt-0.5">
                  <button
                    onClick={onActivateInvulnerability}
                    disabled={isInvulnerable || activeFood < 50}
                    className={`w-full py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-xs select-none ${
                      isInvulnerable
                        ? 'bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500 text-slate-950 shadow-lg shadow-yellow-500/50 ring-2 ring-yellow-300 animate-pulse cursor-default'
                        : activeFood >= 50
                        ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/50 border border-indigo-400/50 cursor-pointer active:scale-95'
                        : 'bg-slate-800/60 text-slate-500 border border-slate-700/40 cursor-not-allowed opacity-60'
                    }`}
                    title={
                      isInvulnerable
                        ? `Щит активен: ${invulnerableSec > 0 ? invulnerableSec.toFixed(1) : '10'}с`
                        : activeFood >= 50
                        ? 'Активировать щит неуязвимости на 10 сек [V] (Стоимость: 50 еды/золота)'
                        : 'Недостаточно еды/золота для щита (требуется 50 🍎)'
                    }
                  >
                    <Shield className={`w-3.5 h-3.5 ${isInvulnerable ? 'fill-slate-950 text-slate-950 animate-bounce' : 'text-amber-400'}`} />
                    <span>
                      {isInvulnerable
                        ? `🛡️ ЩИТ: ${invulnerableSec > 0 ? `${invulnerableSec.toFixed(1)}с` : '10с'}`
                        : activeFood >= 50
                        ? '🛡️ ЗАЩИТА [V] (50 🪙)'
                        : '🛡️ ЩИТ: 50 🪙 (НЕ ХВАТАЕТ)'}
                    </span>
                  </button>
                </div>
              )}

              {/* Neutral / Brake Action Button (N key) */}
              <div className="pt-0.5">
                <button
                  onClick={() => onToggleBrake?.()}
                  className={`w-full py-1.5 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-xs select-none cursor-pointer ${
                    isBraking
                      ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/60 ring-2 ring-rose-300 animate-pulse'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
                  }`}
                  title="Тормоз (Нейтраль) [N] — чудик замирает на месте до следующего нажатия кнопки N"
                >
                  <span>{isBraking ? '🛑' : '⏸️'}</span>
                  <span>{isBraking ? 'ТОРМОЗ ВКЛЮЧЕН [N]' : 'НЕЙТРАЛЬ / ТОРМОЗ [N]'}</span>
                </button>
              </div>

              {/* Dash / Boost Action Button */}
              <div className="pt-0.5">
                <button
                  disabled={!hasFood || isBraking}
                  onMouseDown={() => {
                    if (hasFood && !isBraking) onSetSpacePressed?.(true);
                  }}
                  onMouseUp={() => onSetSpacePressed?.(false)}
                  onTouchStart={() => {
                    if (hasFood && !isBraking) onSetSpacePressed?.(true);
                  }}
                  onTouchEnd={() => onSetSpacePressed?.(false)}
                  className={`w-full py-2 px-2.5 rounded-xl font-bold flex items-center justify-center gap-1.5 transition text-xs select-none ${
                    !hasFood || isBraking
                      ? 'bg-slate-800/60 text-slate-500 border border-slate-700/40 cursor-not-allowed opacity-70'
                      : isActuallyDashing
                      ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/50 scale-[1.02] ring-2 ring-amber-300 cursor-pointer'
                      : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 cursor-pointer'
                  }`}
                  title={
                    isBraking
                      ? 'Ускорение недоступно: чудик на тормозе (N)'
                      : !hasFood
                      ? 'Ускорение недоступно: запас еды равен 0. Соберите еду на поле!'
                      : 'Рывок и ускорение в 1.6 раз. Зажмите ПРОБЕЛ. Расход: 2 ед. еды в секунду'
                  }
                >
                  <Zap className={`w-3.5 h-3.5 ${!hasFood || isBraking ? 'text-slate-500' : isActuallyDashing ? 'animate-pulse text-slate-950' : 'text-amber-400'}`} />
                  <span>
                    {isBraking
                      ? '🛑 НА ТОРМОЗЕ'
                      : !hasFood
                      ? '❌ НЕТ ЕДЫ ДЛЯ РЫВКА (0)'
                      : isActuallyDashing
                      ? '⚡ РЫВОК АКТИВЕН (1.6x)'
                      : '⚡ РЫВОК (ПРОБЕЛ) x1.6'}
                  </span>
                </button>
              </div>

              <div className="text-[10px] text-amber-300/80 text-center font-mono pt-0.5">
                {isBraking
                  ? '🛑 Чудик на тормозе. Нажмите N для возобновления'
                  : 'V: Защита • N: Тормоз • Space: Рывок • A/D: Поворот'}
              </div>
            </div>
          );
        })()}

        {/* On-screen Canvas Zoom & View Controls Toolbar */}
        <div className="flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-slate-800 shadow-xl text-xs font-mono text-slate-300">
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z * 1.2))}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-200"
            title="Приблизить поле (+)"
          >
            <ZoomIn className="w-4 h-4 text-indigo-400" />
          </button>
          <span className="px-2 text-2xs font-bold text-indigo-400 select-none">
            {(zoom * 100).toFixed(0)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.max(0.3, z / 1.2))}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-200"
            title="Отдалить поле (-)"
          >
            <ZoomOut className="w-4 h-4 text-indigo-400" />
          </button>
          <div className="w-px h-4 bg-slate-800 mx-0.5" />
          <button
            onClick={() => {
              const nextState = !isCameraLocked;
              setIsCameraLocked(nextState);
              if (nextState && selectedCreatureId && canvasRef.current) {
                const target = (creaturesRef.current || []).find((c) => c.id === selectedCreatureId);
                if (target) {
                  const width = canvasRef.current.width || canvasRef.current.clientWidth;
                  const height = canvasRef.current.height || canvasRef.current.clientHeight;
                  setOffset({
                    x: width / 2 - target.x * CELL_SIZE * zoom,
                    y: height / 2 - target.y * CELL_SIZE * zoom,
                  });
                }
              }
            }}
            className={`p-2 rounded-lg transition ${
              isCameraLocked && selectedCreatureId
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-900/50'
                : 'hover:bg-slate-800 text-slate-400'
            }`}
            title={
              isCameraLocked && selectedCreatureId
                ? 'Авто-слежение за чудиком (Включено)'
                : 'Включить авто-слежение за чудиком'
            }
          >
            <Crosshair className="w-4 h-4 text-indigo-400" />
          </button>
          <button
            onClick={handleResetView}
            className="p-2 hover:bg-slate-800 rounded-lg transition text-slate-200"
            title="Сбросить масштаб (100%) и центрировать"
          >
            <Maximize2 className="w-4 h-4 text-slate-400 hover:text-slate-200" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const GridCanvas = React.memo(GridCanvasComponent);
export default GridCanvas;
