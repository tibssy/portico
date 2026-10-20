import { clamp, clamp01 } from './head-pose.ts'

export interface PidGains {
  /** Proportional gain, in inverse seconds. */
  kp: number
  /** Integral gain, in inverse seconds squared. */
  ki: number
  /** Derivative gain, in seconds. */
  kd: number
}

export interface CursorAxisConfig {
  gains: PidGains
  /** Low-pass time constant for the incoming target, in seconds. */
  inputTimeConstant: number
  /** Low-pass time constant for the derivative term, in seconds. */
  derivativeTimeConstant: number
  /** Speed clamp, in normalised screen units per second. */
  maxSpeed: number
  /** Integral clamp, in normalised screen units. */
  integralLimit: number
  /** Errors below this are ignored so the cursor settles instead of buzzing. */
  deadband: number
}

export interface CursorControllerConfig {
  x: CursorAxisConfig
  y: CursorAxisConfig
}

/**
 * Tuned for a 30 Hz head-pose stream at 60 fps render. X follows quickly; Y
 * carries more damping because pitch is the noisier axis on most webcams.
 */
export const DEFAULT_CURSOR_CONFIG: CursorControllerConfig = {
  x: {
    gains: { kp: 12, ki: 0.6, kd: 0.36 },
    inputTimeConstant: 0.032,
    derivativeTimeConstant: 0.03,
    maxSpeed: 3.6,
    integralLimit: 0.15,
    deadband: 0.0016,
  },
  y: {
    gains: { kp: 9.2, ki: 0.45, kd: 0.62 },
    inputTimeConstant: 0.075,
    derivativeTimeConstant: 0.055,
    maxSpeed: 2.4,
    integralLimit: 0.1,
    deadband: 0.0026,
  },
}

function timeAlpha(dt: number, tau: number): number {
  if (tau <= 0) return 1
  return 1 - Math.exp(-dt / tau)
}

class PidAxis {
  private value = 0.5
  private target = 0.5
  private integral = 0
  private lastError = 0
  private derivative = 0
  private seeded = false

  reset(): void {
    this.value = 0.5
    this.target = 0.5
    this.integral = 0
    this.lastError = 0
    this.derivative = 0
    this.seeded = false
  }

  step(next: number, dt: number, config: CursorAxisConfig): number {
    const target = clamp01(next)

    if (!this.seeded) {
      this.value = target
      this.target = target
      this.seeded = true
      return this.value
    }

    this.target += (target - this.target) * timeAlpha(dt, config.inputTimeConstant)

    let error = this.target - this.value
    if (Math.abs(error) < config.deadband) error = 0

    const rawDerivative = dt > 0 ? (error - this.lastError) / dt : 0
    this.derivative +=
      (rawDerivative - this.derivative) *
      timeAlpha(dt, config.derivativeTimeConstant)
    this.lastError = error

    if (error !== 0) {
      this.integral = clamp(
        this.integral + error * dt,
        -config.integralLimit,
        config.integralLimit,
      )
    }

    let speed =
      config.gains.kp * error +
      config.gains.ki * this.integral +
      config.gains.kd * this.derivative
    speed = clamp(speed, -config.maxSpeed, config.maxSpeed)

    this.value = clamp01(this.value + speed * dt)
    return this.value
  }
}

/**
 * Two-axis PID cursor. `step` takes a normalised target and a frame delta in
 * seconds, and returns the filtered cursor position.
 */
export class CursorController {
  private x = new PidAxis()
  private y = new PidAxis()
  private readonly config: CursorControllerConfig

  constructor(config: CursorControllerConfig = DEFAULT_CURSOR_CONFIG) {
    this.config = config
  }

  reset(): void {
    this.x.reset()
    this.y.reset()
  }

  step(target: { x: number; y: number }, dt: number): { x: number; y: number } {
    const delta = clamp(dt, 0.0005, 0.05)
    return {
      x: this.x.step(target.x, delta, this.config.x),
      y: this.y.step(target.y, delta, this.config.y),
    }
  }
}
