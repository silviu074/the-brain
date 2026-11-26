# Brain sky: bakes Mars, Neptune, the lava moon, ring and nebula-haze textures and models asteroid rocks.
# (Earth, Moon, Jupiter, galaxies and nebula photos are free downloads, see space/CREDITS.md.)
# Run: blender -b --python make_space.py   -> models/space/*.png and models/space/rocks.glb
import bpy, bmesh, math, os, random
from mathutils import Vector, noise

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'space')
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.engine = 'CYCLES'
sc.cycles.device = 'CPU'
sc.cycles.samples = 1
sc.render.bake.margin = 0

def lin(h):  # '#rrggbb' sRGB -> linear rgba
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple((x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4) for x in c) + (1.0,)

class G:  # small node-graph helper
    def __init__(s, name):
        s.mat = bpy.data.materials.new(name); s.mat.use_nodes = True
        s.nt = s.mat.node_tree; s.nt.nodes.clear()
    def node(s, t, **kw):
        n = s.nt.nodes.new(t)
        for k, v in kw.items(): setattr(n, k, v)
        return n
    def link(s, sock, val):
        if isinstance(val, (int, float)): sock.default_value = val
        elif isinstance(val, tuple): sock.default_value = val
        else: s.nt.links.new(val, sock)
    def m(s, op, a, b=0.0, c=None):
        n = s.node('ShaderNodeMath', operation=op)
        s.link(n.inputs[0], a); s.link(n.inputs[1], b)
        if c is not None: s.link(n.inputs[2], c)
        return n.outputs[0]
    def v(s, op, a, b=(0.0, 0.0, 0.0)):
        n = s.node('ShaderNodeVectorMath', operation=op)
        s.link(n.inputs[0], a); s.link(n.inputs[1], b)
        return n.outputs['Value'] if op in ('LENGTH', 'DOT_PRODUCT', 'DISTANCE') else n.outputs['Vector']
    def xyz(s, x, y, z):
        n = s.node('ShaderNodeCombineXYZ')
        for i, a in enumerate((x, y, z)): s.link(n.inputs[i], a)
        return n.outputs[0]
    def sep(s, vec):
        n = s.node('ShaderNodeSeparateXYZ'); s.link(n.inputs[0], vec); return n.outputs
    def noise(s, vec, scale, detail=8, rough=0.55, dist=0.0, w=None):
        n = s.node('ShaderNodeTexNoise')
        if w is not None: n.noise_dimensions = '4D'; s.link(n.inputs['W'], w)
        s.link(n.inputs['Vector'], vec); n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough
        n.inputs['Distortion'].default_value = dist
        return n.outputs['Fac']
    def vor(s, vec, scale, feat='F1'):
        n = s.node('ShaderNodeTexVoronoi', feature=feat)
        s.link(n.inputs['Vector'], vec); n.inputs['Scale'].default_value = scale
        return n.outputs['Distance']
    def ramp(s, fac, stops):  # stops: [(pos, '#hex' or gray float)]
        n = s.node('ShaderNodeValToRGB'); s.link(n.inputs[0], fac)
        els = n.color_ramp.elements
        while len(els) < len(stops): els.new(0.5)
        for e, (p, c) in zip(els, stops):
            e.position = p; e.color = lin(c) if isinstance(c, str) else (c, c, c, 1.0)
        return n.outputs['Color']
    def mix(s, fac, a, b, blend='MIX'):
        n = s.node('ShaderNodeMix', data_type='RGBA', blend_type=blend)
        s.link(n.inputs[0], fac)
        s.link([i for i in n.inputs if i.name == 'A' and i.type == 'RGBA'][0], a)
        s.link([i for i in n.inputs if i.name == 'B' and i.type == 'RGBA'][0], b)
        return [o for o in n.outputs if o.type == 'RGBA'][0]
    def gray(s, col):  # color -> float
        n = s.node('ShaderNodeRGBToBW'); s.link(n.inputs[0], col); return n.outputs[0]
    def emit(s, col):
        e = s.node('ShaderNodeEmission'); s.link(e.inputs['Color'], col)
        o = s.node('ShaderNodeOutputMaterial'); s.nt.links.new(e.outputs[0], o.inputs['Surface'])
    def uv(s):
        t = s.node('ShaderNodeTexCoord'); return s.sep(t.outputs['UV'])
    def sphere(s):  # equirect UV -> unit direction (seamless, no pole pinch); also returns lon, lat
        u, v, _ = s.uv()
        lon = s.m('MULTIPLY', u, 2 * math.pi); lat = s.m('MULTIPLY', s.m('SUBTRACT', v, 0.5), math.pi)
        cl = s.m('COSINE', lat)
        P = s.xyz(s.m('MULTIPLY', cl, s.m('COSINE', lon)), s.m('MULTIPLY', cl, s.m('SINE', lon)), s.m('SINE', lat))
        return P, lon, lat
    def flat(s):  # sprite: centered -1..1
        u, v, _ = s.uv()
        X = s.m('MULTIPLY_ADD', u, 2.0, -1.0); Y = s.m('MULTIPLY_ADD', v, 2.0, -1.0)
        return X, Y

plane = None
def bake(g, name, w, h):
    global plane
    if plane is None:
        bpy.ops.mesh.primitive_plane_add(size=2); plane = bpy.context.active_object
    img = bpy.data.images.new(name, w, h)
    tn = g.node('ShaderNodeTexImage'); tn.image = img
    g.nt.nodes.active = tn
    plane.data.materials.clear(); plane.data.materials.append(g.mat)
    bpy.ops.object.select_all(action='DESELECT'); plane.select_set(True); bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type='EMIT')
    img.filepath_raw = os.path.join(OUT, name + '.png'); img.file_format = 'PNG'; img.save()
    print('baked', name)

# ---------------- planets (equirect, 2:1) ----------------
def mars():
    g = G('mars'); P, lon, lat = g.sphere()
    h = g.noise(P, 2.2, 14, 0.6, 0.1)
    col = g.ramp(h, [(0.3, '#3a160c'), (0.45, '#7a3018'), (0.55, '#b0522a'), (0.65, '#c87a46'), (0.78, '#e2a874')])
    cr = g.ramp(g.vor(P, 7.0), [(0.0, 0.62), (0.07, 0.75), (0.1, 1.35), (0.14, 1.0)])
    cr2 = g.ramp(g.vor(P, 19.0), [(0.0, 0.7), (0.06, 0.8), (0.09, 1.25), (0.12, 1.0)])
    col = g.mix(1.0, g.mix(1.0, col, cr, 'MULTIPLY'), cr2, 'MULTIPLY')
    ice = g.ramp(g.m('ABSOLUTE', g.sep(P)[2]), [(0.9, 0.0), (0.94, 1.0)])
    g.emit(g.mix(g.gray(ice), col, lin('#f4ece4'))); bake(g, 'mars', 1024, 512)

def ice_giant():
    g = G('neptune'); P, lon, lat = g.sphere()
    x, y, z = g.sep(P)
    warp = g.noise(P, 2.0, 5, 0.5, 0.3)
    f = g.m('MULTIPLY_ADD', g.m('SINE', g.m('ADD', g.m('MULTIPLY', z, 6.0), g.m('MULTIPLY', warp, 1.5))), 0.5, 0.5)
    col = g.ramp(f, [(0.0, '#162f7a'), (0.4, '#2a56b8'), (0.7, '#3f78dc'), (1.0, '#6a9cee')])
    wisp = g.ramp(g.noise(g.v('MULTIPLY', P, (1.0, 1.0, 9.0)), 2.5, 8, 0.6), [(0.62, 0.0), (0.75, 0.9)])
    col = g.mix(g.gray(wisp), col, lin('#e8f2ff'))
    dx = g.m('MULTIPLY', g.m('SUBTRACT', lon, 4.1), g.m('COSINE', lat)); dy = g.m('ADD', lat, 0.4)
    e = g.m('SQRT', g.m('ADD', g.m('POWER', g.m('DIVIDE', dx, 0.16), 2.0), g.m('POWER', g.m('DIVIDE', dy, 0.08), 2.0)))
    col = g.mix(g.gray(g.ramp(e, [(0.6, 1.0), (1.0, 0.0)])), col, lin('#0c1a4a'))
    g.emit(col); bake(g, 'neptune', 1024, 512)

def lava():
    g = G('lava'); P, lon, lat = g.sphere()
    rock = g.ramp(g.noise(P, 5.0, 12, 0.6), [(0.3, '#120c0a'), (0.6, '#2e2420'), (0.8, '#4a3a30')])
    g.emit(rock); bake(g, 'lava', 1024, 512)
    g2 = G('lava_glow'); P, lon, lat = g2.sphere()
    w = g2.noise(P, 2.0, 4, 0.5)
    q = g2.v('ADD', P, g2.xyz(g2.m('MULTIPLY', w, 0.5), g2.m('MULTIPLY', w, -0.4), g2.m('MULTIPLY', w, 0.3)))
    e1 = g2.gray(g2.ramp(g2.vor(q, 4.0, 'DISTANCE_TO_EDGE'), [(0.0, 1.0), (0.05, 0.0)]))
    e2 = g2.m('MULTIPLY', g2.gray(g2.ramp(g2.vor(q, 11.0, 'DISTANCE_TO_EDGE'), [(0.0, 1.0), (0.04, 0.0)])), 0.6)
    g2.emit(g2.ramp(g2.m('MAXIMUM', e1, e2), [(0.0, 0.0), (1.0, 1.0)])); bake(g2, 'lava_glow', 1024, 512)

def rings():
    g = G('rings'); u, v, _ = g.uv()
    n = g.noise(g.xyz(g.m('MULTIPLY', u, 3.0), 0.0, 0.0), 9.0, 10, 0.65)
    d = g.ramp(n, [(0.25, 0.1), (0.75, 1.0)])
    gap = g.ramp(u, [(0.0, 0.0), (0.04, 1.0), (0.56, 1.0), (0.58, 0.04), (0.62, 0.04), (0.64, 1.0), (0.93, 0.8), (1.0, 0.0)])
    g.emit(g.mix(1.0, d, gap, 'MULTIPLY')); bake(g, 'rings', 1024, 16)

# ---------------- sprites (additive, black = empty) ----------------
def nebula(name, seed, cols, knot):
    g = G(name); X, Y = g.flat()
    r = g.v('LENGTH', g.xyz(X, Y, 0.0))
    p = g.xyz(X, Y, seed)
    n1 = g.noise(p, 1.4, 14, 0.62, 0.7)
    n2 = g.noise(p, 2.6, 8, 0.55, 0.3, w=seed)
    fall = g.gray(g.ramp(g.m('ADD', r, g.m('MULTIPLY', g.m('SUBTRACT', n2, 0.5), 0.5)), [(0.0, 1.0), (0.5, 0.55), (0.92, 0.0)]))
    dens = g.m('MULTIPLY', g.gray(g.ramp(n1, [(0.4, 0.0), (0.72, 1.0)])), fall)
    col = g.ramp(n2, [(0.3, cols[0]), (0.45, cols[1]), (0.6, cols[2]), (0.72, cols[3])])
    dust = g.ramp(g.noise(p, 3.2, 12, 0.6, 0.2, w=seed + 3.0), [(0.5, 1.0), (0.64, 0.12)])
    c = g.mix(1.0, g.mix(dens, lin('#000000'), col), dust, 'MULTIPLY')
    knots = g.m('MULTIPLY', g.gray(g.ramp(g.vor(p, 14.0), [(0.0, 1.0), (0.05, 0.0)])), dens)
    g.emit(g.mix(g.m('MINIMUM', g.m('MULTIPLY', knots, 1.6), 1.0), c, lin(knot), 'ADD')); bake(g, name, 1024, 1024)

mars(); ice_giant(); lava(); rings()
nebula('nebula_violet', 1.3, ['#2a3cff', '#7a3cff', '#ff3fa8', '#ff9ad8'], '#ffd8f0')
nebula('nebula_teal', 7.7, ['#0a6aff', '#18d8d0', '#ff8a3a', '#ffe08a'], '#e8fff8')
nebula('nebula_red', 4.2, ['#7a0a30', '#ff3a20', '#ff9a40', '#ffe0a0'], '#fff0d0')

# ---------------- asteroids ----------------
for o in list(bpy.data.objects): bpy.data.objects.remove(o)
random.seed(7)
for k in range(6):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=4, radius=1.0)
    off = Vector((random.random() * 50, random.random() * 50, random.random() * 50))
    stretch = Vector((1.0, 0.6 + random.random() * 0.35, 0.5 + random.random() * 0.3))
    craters = [(Vector((random.random() - .5, random.random() - .5, random.random() - .5)).normalized(), 0.18 + random.random() * 0.3) for _ in range(5)]
    for vtx in bm.verts:
        d = vtx.co.normalized()
        h = 1.0 + 0.35 * noise.fractal(d * 1.4 + off, 0.6, 2.0, 4) + 0.06 * noise.fractal(d * 6 + off, 0.5, 2.0, 3)
        for cd, cr in craters:
            a = (d - cd).length
            if a < cr: h -= 0.12 * (1 - (a / cr) ** 2)
            elif a < cr * 1.3: h += 0.04 * (1 - (a - cr) / (cr * 0.3))
        vtx.co = Vector((d.x * stretch.x, d.y * stretch.y, d.z * stretch.z)) * h
    me = bpy.data.meshes.new(f'Rock{k}'); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(f'Rock{k}', me); sc.collection.objects.link(ob)
    dec = ob.modifiers.new('dec', 'DECIMATE'); dec.ratio = 0.35
    bpy.context.view_layer.objects.active = ob; ob.select_set(True)
    bpy.ops.object.modifier_apply(modifier='dec')
    me.shade_smooth() if hasattr(me, 'shade_smooth') else None
    ob.location.x = k * 3
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'rocks.glb'), export_format='GLB', use_selection=True, export_materials='NONE', export_apply=True)
print('rocks done')
