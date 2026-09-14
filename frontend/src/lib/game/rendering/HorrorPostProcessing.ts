import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const horrorShader = {
	uniforms: {
		tDiffuse: { value: null },
		time: { value: 0 },
		resolution: { value: new THREE.Vector2(1, 1) }
	},
	vertexShader: /* glsl */ `
		varying vec2 vUv;
		void main() {
			vUv = uv;
			gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
		}
	`,
	fragmentShader: /* glsl */ `
		uniform sampler2D tDiffuse;
		uniform float time;
		uniform vec2 resolution;
		varying vec2 vUv;

		float random(vec2 value) {
			// Interleaved gradient noise avoids the expensive per-pixel sine hash.
			return fract(52.9829189 * fract(dot(value, vec2(0.06711056, 0.00583715))));
		}

		void main() {
			vec2 centered = vUv - 0.5;
			float edge = smoothstep(0.25, 0.76, dot(centered, centered) * 1.8);
			float frame = floor(time * 24.0);
			float grain = random(vUv * resolution + vec2(frame, frame * 0.37)) - 0.5;
			float coarseGrain = random(floor(vUv * resolution * 0.35) + vec2(frame * 0.61)) - 0.5;
			float scanline = sin((vUv.y * resolution.y + time * 12.0) * 1.65) * 0.013;
			vec3 color = texture2D(tDiffuse, vUv).rgb;
			color += grain * 0.045 + coarseGrain * 0.008 + scanline;
			color *= 1.0 - edge * 0.22;
			color = mix(color, color * vec3(0.94, 0.96, 0.88), 0.1);
			gl_FragColor = vec4(color, 1.0);
		}
	`
};

export class HorrorPostProcessing {
	private readonly composer: EffectComposer;
	private readonly horrorPass: ShaderPass;

	constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
		this.composer = new EffectComposer(renderer);
		this.composer.addPass(new RenderPass(scene, camera));
		this.horrorPass = new ShaderPass(horrorShader);
		this.composer.addPass(this.horrorPass);
		this.composer.addPass(new OutputPass());
	}

	render(elapsedSeconds: number): void {
		this.horrorPass.uniforms.time.value = elapsedSeconds;
		this.composer.render();
	}

	setSize(width: number, height: number, pixelRatio: number): void {
		this.composer.setPixelRatio(pixelRatio);
		this.composer.setSize(width, height);
		this.horrorPass.uniforms.resolution.value.set(width * pixelRatio, height * pixelRatio);
	}

	dispose(): void {
		this.composer.dispose();
	}
}
