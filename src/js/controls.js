import * as THREE from "three";
import {
  DESKTOP_ROTATE_SPEED,
  CLICK_MOVE_LIMIT,
  DESKTOP_ROLL_DRAG_SPEED,
  TOUCH_ROTATE_SPEED,
  TOUCH_TWIST_ROLL_SPEED,
  TOUCH_ZOOMED_ROTATE_SPEED,
  TRI_MAX_DISTANCE,
  TRI_MIN_DISTANCE
} from "./config.js";

export function createPointerActivationTracker(moveLimit = CLICK_MOVE_LIMIT) {
  const downPoints = new Map();

  return {
    start(event) {
      downPoints.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType
      });
    },

    consume(event) {
      const downPoint = downPoints.get(event.pointerId);
      downPoints.delete(event.pointerId);
      if (!downPoint || downPoint.pointerType !== event.pointerType) return null;

      const moved = Math.hypot(event.clientX - downPoint.x, event.clientY - downPoint.y);
      return moved <= moveLimit
        ? { clientX: event.clientX, clientY: event.clientY }
        : null;
    },

    cancel(pointerId) {
      downPoints.delete(pointerId);
    },

    clear() {
      downPoints.clear();
    }
  };
}

export function setupCatMoonControls({
  renderer,
  controls,
  camera,
  getActiveObject,
  updateHoverFromClient,
  clearHover,
  suppressTransientHover,
  touchHoverCooldownMs = 300,
  activateCatAtClient,
  pauseAutoRotate,
  scheduleAutoRotateResume,
  cancelFocusAnimation,
  incrementFocusInteractionVersion
}) {
  const activePointers = new Map();
  let twoFingerLastAngle = null;
  let touchGestureWasTwoFinger = false;
  let rollDrag = null;
  const activationTracker = createPointerActivationTracker();

  function canRollActiveObject() {
    return Boolean(getActiveObject());
  }

  function getTouchRotateSpeed() {
    const distance = controls.object.position.length();
    const zoomedT = Math.max(0, Math.min(1, (distance - TRI_MIN_DISTANCE) / (TRI_MAX_DISTANCE - TRI_MIN_DISTANCE)));
    return TOUCH_ZOOMED_ROTATE_SPEED + ((TOUCH_ROTATE_SPEED - TOUCH_ZOOMED_ROTATE_SPEED) * zoomedT);
  }

  function updateRotateSpeedForPointer(pointerType) {
    if (pointerType === "touch") {
      const hasActiveTouch = Array.from(activePointers.values()).some((pointerInfo) => pointerInfo.pointerType === "touch");
      controls.rotateSpeed = hasActiveTouch ? getTouchRotateSpeed() : DESKTOP_ROTATE_SPEED;
      return;
    }

    if (!Array.from(activePointers.values()).some((pointerInfo) => pointerInfo.pointerType === "touch")) {
      controls.rotateSpeed = DESKTOP_ROTATE_SPEED;
    }
  }

  function rollActiveObject(delta) {
    const activeObject = getActiveObject();
    if (!activeObject) return;
    const axis = new THREE.Vector3();
    camera.getWorldDirection(axis);
    activeObject.rotateOnWorldAxis(axis.normalize(), delta);
  }

  function beginRollDrag(event) {
    rollDrag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY
    };
    controls.enabled = false;
    renderer.domElement.setPointerCapture?.(event.pointerId);
    event.preventDefault();
    event.stopImmediatePropagation();
  }

  function releaseRendererPointerCapture(pointerId) {
    try {
      renderer.domElement.releasePointerCapture?.(pointerId);
    } catch (error) {
      // Pointer capture may already be gone after blur/cancel.
    }
  }

  function captureRendererPointer(pointerId) {
    try {
      renderer.domElement.setPointerCapture?.(pointerId);
    } catch (error) {
      // Pointer capture is unavailable for some synthetic or interrupted input.
    }
  }

  function endRollDrag(event) {
    if (!rollDrag) return;

    const pointerId = rollDrag.pointerId;
    rollDrag = null;
    controls.enabled = true;
    if (event) {
      releaseRendererPointerCapture(event.pointerId);
      event.preventDefault();
      event.stopImmediatePropagation();
    } else {
      releaseRendererPointerCapture(pointerId);
    }
    activationTracker.cancel(pointerId);
    scheduleAutoRotateResume();
  }

  function pointerAngleFromActiveTouches() {
    const touches = Array.from(activePointers.values()).filter((pointerInfo) => pointerInfo.pointerType === "touch");
    if (touches.length !== 2) return null;
    return Math.atan2(touches[1].y - touches[0].y, touches[1].x - touches[0].x);
  }

  function updateTouchTwistRoll() {
    const angle = pointerAngleFromActiveTouches();
    if (angle === null) {
      twoFingerLastAngle = null;
      return;
    }

    touchGestureWasTwoFinger = true;
    if (twoFingerLastAngle !== null) {
      let delta = angle - twoFingerLastAngle;
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      rollActiveObject(delta * TOUCH_TWIST_ROLL_SPEED);
    }

    twoFingerLastAngle = angle;
  }

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (activePointers.has(event.pointerId)) {
      activePointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        pointerType: event.pointerType
      });
    }

    if (rollDrag) {
      const dx = event.clientX - rollDrag.x;
      rollActiveObject(dx * DESKTOP_ROLL_DRAG_SPEED);
      rollDrag.x = event.clientX;
      rollDrag.y = event.clientY;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }

    updateTouchTwistRoll();
    updateRotateSpeedForPointer(event.pointerType);
    if (event.pointerType === "touch") {
      suppressTransientHover();
      return;
    }

    updateHoverFromClient(event.clientX, event.clientY);
  }, { capture: true });

  renderer.domElement.addEventListener("pointerleave", () => {
    clearHover();
  });

  renderer.domElement.addEventListener("contextmenu", (event) => {
    event.preventDefault();
  });

  renderer.domElement.addEventListener("pointerdown", (event) => {
    incrementFocusInteractionVersion();
    cancelFocusAnimation();
    pauseAutoRotate();
    activePointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      pointerType: event.pointerType
    });
    activationTracker.start(event);
    captureRendererPointer(event.pointerId);

    updateRotateSpeedForPointer(event.pointerType);

    if (event.pointerType === "touch") {
      suppressTransientHover();
    }

    const isRightMouseRoll = event.pointerType === "mouse" && event.button === 2;
    if ((isRightMouseRoll || event.ctrlKey || event.altKey) && canRollActiveObject()) {
      beginRollDrag(event);
    }

  }, { capture: true });

  renderer.domElement.addEventListener("pointerup", (event) => {
    activePointers.delete(event.pointerId);
    updateTouchTwistRoll();
    updateRotateSpeedForPointer(event.pointerType);

    if (touchGestureWasTwoFinger && event.pointerType === "touch") {
      activationTracker.cancel(event.pointerId);
      releaseRendererPointerCapture(event.pointerId);
      if (activePointers.size < 2) {
        touchGestureWasTwoFinger = false;
      }
      suppressTransientHover(touchHoverCooldownMs);
      scheduleAutoRotateResume();
      return;
    }

    if (rollDrag && rollDrag.pointerId === event.pointerId) {
      activationTracker.cancel(event.pointerId);
      endRollDrag(event);
      return;
    }

    const activation = activationTracker.consume(event);

    if (event.pointerType === "touch") {
      suppressTransientHover(touchHoverCooldownMs);
    } else {
      updateHoverFromClient(event.clientX, event.clientY);
    }

    if (activation) {
      activateCatAtClient(activation.clientX, activation.clientY);
    }

    releaseRendererPointerCapture(event.pointerId);
    scheduleAutoRotateResume();
  }, { capture: true });

  renderer.domElement.addEventListener("pointercancel", (event) => {
    activePointers.delete(event.pointerId);
    twoFingerLastAngle = null;
    touchGestureWasTwoFinger = false;
    updateRotateSpeedForPointer(event.pointerType);
    if (event.pointerType === "touch") {
      suppressTransientHover(touchHoverCooldownMs);
    }
    if (rollDrag && rollDrag.pointerId === event.pointerId) {
      activationTracker.cancel(event.pointerId);
      endRollDrag(event);
      return;
    }
    activationTracker.cancel(event.pointerId);
    releaseRendererPointerCapture(event.pointerId);
    scheduleAutoRotateResume();
  }, { capture: true });

  window.addEventListener("blur", () => {
    if (rollDrag) {
      endRollDrag();
    }
    activationTracker.clear();
    controls.rotateSpeed = DESKTOP_ROTATE_SPEED;
  });

  return {
    hasActiveInput() {
      return Boolean(activePointers.size || rollDrag);
    }
  };
}
