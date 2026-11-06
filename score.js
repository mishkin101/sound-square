// sound-square score: what the square does, bar by bar.
// Bar 1 is the first downbeat. Inside a bar, beats count from 0 (the downbeat) to 3.
// Edit by hand, or tune with the studio's sliders and use "Copy score.js".

const SCORE = {
  // The song. The Spotify id gets filled in when we connect Spotify.
  song: {
    title: "I Haven't Recovered From Last Night With You",
    artist: "Divorce from New York",
    spotifyId: "0KJKIGebZqDyMoxI2NMpL0",
  },
  // Timing grid: a placeholder until we tap along to the real song.
  bpm: 126,
  beatsPerBar: 4,
  firstDownbeatMs: 1615,
  bars: 216,
  // Energy from 0 to 1 at chosen bars; bars in between blend smoothly.
  energy: [[1, 0.2], [9, 0.4], [17, 0.65], [25, 0.7], [33, 0.85], [41, 0.55], [48, 0.3]],
  // What happens in the music. A pattern lists beats inside one bar and repeats
  // for every bar in `bars`. Holds are [bar, beat, length in beats].
  tracks: {
    claps: { bars: [9, 40], pattern: [1, 3] },
    bongos: { bars: [9, 40], pattern: [0.5, 0.75, 1.5, 2.25, 2.5, 3.5, 3.75] },
    keys: { holds: [[41, 0, 6], [42, 3, 2], [43, 2, 7], [45, 2, 3], [46, 2, 6], [48, 0, 3]] },
  },
  // Palettes share the same slots, so any two can blend.
  palettes: {
    salmon: {
      ground: "#f3a08b",
      glow: "#f8bfae",
      line: "#2e8b82",
      ink: "#1c5954",
      light: "#fff3ea",
      dreamy: ["#ff8fc4", "#b99cff", "#7fd3ff", "#ffe370", "#8ff0c2"],
    },
    dream: {
      ground: "#f19bab",
      glow: "#f6c3d3",
      line: "#2a8a8c",
      ink: "#1a4f5d",
      light: "#fff2f6",
      dreamy: ["#ffa3d6", "#a99aff", "#86dcff", "#fff08a", "#a0f4d2"],
    },
    deep: {
      ground: "#ec8c77",
      glow: "#f3a993",
      line: "#23756e",
      ink: "#164a46",
      light: "#ffeee4",
      dreamy: ["#ff7fb3", "#a58cff", "#6cc8f4", "#ffd65e", "#80e5b3"],
    },
  },
  // Which palette starts at which bar. Changes blend over colorFadeBars.
  colors: [[1, "salmon"], [33, "dream"], [41, "deep"]],
  colorFadeBars: 2,
  // Names for the timeline. Number keys 1-6 jump to them.
  sections: [],
  // Things you hear, marked on the song (M in the studio while it plays; held
  // down, M marks a hold: [start, end] in beats, a span like the bongo section).
  // Layers come in and leave on them, spots move on their hits, pulses run between them.
  // Each can carry a note; hide: true keeps its marker off the timeline.
  moments: [
    {
      name: "eye panning",
      hits: [4.15, 5.06, 5.78, 6.88, 7.32, 8.38, 9.11, 9.83, 10.9, 11.35],
      repeat: { every: 8, times: 3 },
    },
    { name: "Pulse", hits: [0.05], repeat: { every: 4, times: 610 } },
    {
      name: "Bongo drums",
      hits: [28.11, 29.25, 29.4, 29.82, 30.92, 31.2, 31.5, 32.06, 33.19, 33.76, 33.88, 34.31, 34.85],
      repeat: { every: 8, times: 1 },
    },
    {
      name: "bongo drum start",
      hits: [12.38, 12.92, 13.49, 14.04, 15.21, 15.76, 16.32, 16.88, 17.43, 17.98],
    },
    {
      name: "triangle tick",
      hits: [36.03],
      path: [
        [
          [0.2477, 0.1743, 46.18],
          [0.2471, 0.1752, 46.1969],
          [0.2458, 0.1772, 46.2363],
          [0.244, 0.1798, 46.2719],
          [0.2406, 0.1843, 46.3056],
          [0.2378, 0.1873, 46.3288],
          [0.2349, 0.1903, 46.3512],
          [0.2328, 0.1929, 46.3637],
          [0.2313, 0.1952, 46.37],
          [0.2297, 0.1975, 46.3812],
          [0.2282, 0.1998, 46.395],
          [0.226, 0.2032, 46.4063],
          [0.2244, 0.2055, 46.4131],
          [0.2229, 0.2078, 46.4225],
          [0.2211, 0.2101, 46.4325],
          [0.2189, 0.2123, 46.4425],
          [0.2166, 0.2152, 46.4544],
          [0.2143, 0.2188, 46.4688],
          [0.2108, 0.224, 46.495],
          [0.2085, 0.2271, 46.5144],
          [0.2062, 0.2301, 46.5313],
          [0.204, 0.2333, 46.5463],
          [0.2017, 0.2368, 46.5612],
          [0.1993, 0.2405, 46.5769],
          [0.1965, 0.2439, 46.595],
          [0.1925, 0.2482, 46.6213],
          [0.1908, 0.2506, 46.6325],
          [0.1892, 0.2532, 46.6425],
          [0.1877, 0.2561, 46.6525],
          [0.1862, 0.2589, 46.6644],
          [0.1847, 0.2613, 46.6787],
          [0.1829, 0.2639, 46.6956],
          [0.1794, 0.2685, 46.7244],
          [0.1766, 0.272, 46.7412],
          [0.1737, 0.2757, 46.7569],
          [0.1711, 0.279, 46.775],
          [0.1688, 0.2821, 46.7944],
          [0.167, 0.2846, 46.8112],
          [0.1654, 0.2869, 46.8269],
          [0.1623, 0.2903, 46.855],
          [0.1603, 0.2926, 46.8731],
          [0.1586, 0.2949, 46.8888],
          [0.1571, 0.2972, 46.9056],
          [0.1556, 0.2995, 46.925],
          [0.1541, 0.3018, 46.9431],
          [0.1525, 0.3041, 46.9587],
          [0.1502, 0.3075, 46.985],
          [0.1487, 0.3098, 47.0044],
          [0.1472, 0.3121, 47.0213],
          [0.1457, 0.3145, 47.0356],
          [0.1441, 0.3167, 47.0475],
          [0.1426, 0.319, 47.0581],
          [0.141, 0.3218, 47.0713],
          [0.1385, 0.3264, 47.0956],
          [0.1363, 0.3295, 47.115],
          [0.1342, 0.3323, 47.1331],
          [0.1327, 0.3347, 47.1488],
          [0.1309, 0.3375, 47.1694],
          [0.1287, 0.3412, 47.1975],
          [0.1266, 0.3444, 47.2256],
          [0.1242, 0.348, 47.2638],
          [0.1227, 0.3504, 47.2888],
          [0.1214, 0.3524, 47.3106],
          [0.1208, 0.3532, 47.32],
        ],
        [
          [0.3379, 0.3654, 50.24],
          [0.3356, 0.3671, 50.2625],
          [0.3327, 0.3695, 50.2906],
          [0.3299, 0.3729, 50.3188],
          [0.3281, 0.3755, 50.3375],
          [0.3247, 0.38, 50.3731],
          [0.3224, 0.383, 50.395],
          [0.3193, 0.3873, 50.4212],
          [0.3177, 0.3897, 50.4325],
          [0.3142, 0.3937, 50.4513],
          [0.3113, 0.3969, 50.4669],
          [0.3076, 0.4023, 50.495],
          [0.3053, 0.4056, 50.5094],
          [0.3019, 0.4093, 50.5194],
          [0.3001, 0.4116, 50.5275],
          [0.2976, 0.415, 50.5425],
          [0.2954, 0.4172, 50.5525],
          [0.2919, 0.4213, 50.5675],
          [0.2896, 0.4243, 50.5769],
          [0.2862, 0.4279, 50.5863],
          [0.2839, 0.4302, 50.5931],
          [0.2805, 0.4338, 50.6075],
          [0.2779, 0.438, 50.6225],
          [0.2761, 0.4405, 50.6325],
          [0.2727, 0.4433, 50.6469],
          [0.2699, 0.4462, 50.6538],
          [0.2658, 0.4514, 50.6631],
          [0.2642, 0.4539, 50.6725],
          [0.2613, 0.4568, 50.6875],
          [0.2591, 0.4584, 50.6975],
          [0.2565, 0.4616, 50.7125],
          [0.255, 0.4639, 50.7206],
          [0.2527, 0.4674, 50.7294],
          [0.2511, 0.4697, 50.7375],
          [0.2486, 0.4731, 50.7525],
          [0.2464, 0.4753, 50.7625],
          [0.2435, 0.4788, 50.7738],
          [0.242, 0.4811, 50.7794],
          [0.2397, 0.4845, 50.7925],
          [0.2382, 0.4868, 50.8025],
          [0.2359, 0.4903, 50.8175],
          [0.2343, 0.4926, 50.8275],
          [0.2318, 0.4963, 50.8444],
          [0.2285, 0.5007, 50.8656],
          [0.2267, 0.5033, 50.8775],
          [0.2242, 0.5067, 50.8925],
          [0.2219, 0.509, 50.9025],
          [0.219, 0.5124, 50.9175],
          [0.2174, 0.5148, 50.9269],
          [0.2143, 0.5191, 50.9363],
          [0.2123, 0.5219, 50.9431],
          [0.2098, 0.5256, 50.9575],
          [0.2078, 0.5283, 50.9675],
          [0.2046, 0.5329, 50.9825],
          [0.203, 0.5359, 50.9925],
          [0.1995, 0.5417, 51.0075],
          [0.1966, 0.546, 51.0181],
          [0.1929, 0.5512, 51.0388],
          [0.1917, 0.553, 51.05],
        ],
      ],
    },
    { name: "heavy kick", hits: [43.89] },
    {
      name: "line and circle",
      hits: [56.04],
      path: [
        [
          [0.4982, 0.48, 56.05],
          [0.4948, 0.48, 56.3625],
          [0.4894, 0.48, 56.5875],
          [0.4825, 0.48, 56.6606],
          [0.477, 0.4801, 56.6981],
          [0.4701, 0.4817, 56.7506],
          [0.4643, 0.4849, 56.7869],
          [0.4579, 0.4879, 56.8331],
          [0.4538, 0.4911, 56.8656],
          [0.4484, 0.4937, 56.9069],
          [0.4433, 0.4989, 56.96],
          [0.4394, 0.5063, 57.0388],
          [0.4376, 0.513, 57.0888],
          [0.4357, 0.5185, 57.135],
          [0.4345, 0.5239, 57.175],
          [0.4333, 0.5307, 57.2188],
          [0.4327, 0.5361, 57.2613],
          [0.4327, 0.5416, 57.305],
          [0.4327, 0.547, 57.3513],
          [0.4328, 0.5539, 57.415],
          [0.4342, 0.5608, 57.4806],
          [0.4363, 0.5665, 57.5406],
          [0.4396, 0.5705, 57.5769],
          [0.4432, 0.5742, 57.6162],
          [0.4481, 0.58, 57.6875],
          [0.4534, 0.5821, 57.7494],
          [0.4589, 0.5839, 57.8113],
          [0.4643, 0.586, 57.8475],
          [0.4711, 0.5891, 57.905],
          [0.4766, 0.5905, 57.9563],
          [0.4821, 0.5927, 58.0188],
          [0.4875, 0.5927, 58.0763],
          [0.4943, 0.5927, 58.1513],
          [0.4998, 0.5927, 58.2075],
          [0.5052, 0.5927, 58.2613],
          [0.5107, 0.5916, 58.3113],
          [0.516, 0.5878, 58.3744],
          [0.5197, 0.5842, 58.4331],
          [0.5247, 0.582, 58.5013],
          [0.5287, 0.5787, 58.5719],
          [0.5329, 0.5737, 58.6719],
          [0.5351, 0.5688, 58.7575],
          [0.5384, 0.5647, 58.8325],
          [0.5403, 0.5593, 58.9175],
          [0.5417, 0.5538, 58.9944],
          [0.5418, 0.547, 59.1138],
          [0.5418, 0.5416, 59.1888],
          [0.5418, 0.5361, 59.2463],
          [0.5418, 0.5307, 59.3125],
          [0.5407, 0.5239, 59.3813],
          [0.5389, 0.5185, 59.4563],
          [0.5359, 0.513, 59.5525],
          [0.5322, 0.5075, 59.6463],
          [0.5278, 0.5023, 59.7588],
          [0.5241, 0.4987, 59.8481],
          [0.5203, 0.4951, 59.9306],
          [0.5153, 0.4929, 60.0188],
          [0.5101, 0.489, 60.1331],
          [0.5048, 0.4868, 60.2306],
          [0.4993, 0.4838, 60.3213],
          [0.4939, 0.4836, 60.4075],
          [0.487, 0.483, 60.4888],
          [0.4816, 0.4825, 60.61],
          [0.4782, 0.4836, 60.76],
        ],
        [
          [0.4855, 0.3055, 43.24],
          [0.4855, 0.306, 43.2438],
          [0.4855, 0.3069, 43.2513],
          [0.4855, 0.3082, 43.2625],
          [0.4856, 0.3118, 43.2925],
          [0.4856, 0.3136, 43.3075],
          [0.4856, 0.3154, 43.3225],
          [0.4857, 0.3171, 43.3375],
          [0.4857, 0.3189, 43.3525],
          [0.4857, 0.3207, 43.3675],
          [0.4857, 0.3225, 43.3825],
          [0.4858, 0.3243, 43.3975],
          [0.4858, 0.3279, 43.4275],
          [0.4858, 0.3297, 43.4425],
          [0.4859, 0.3315, 43.4575],
          [0.4859, 0.3333, 43.4725],
          [0.4859, 0.3351, 43.4875],
          [0.4859, 0.3369, 43.5025],
          [0.486, 0.3386, 43.5175],
          [0.486, 0.3404, 43.5325],
          [0.486, 0.344, 43.5625],
          [0.4861, 0.3458, 43.5775],
          [0.4861, 0.3476, 43.5925],
          [0.4861, 0.3494, 43.6075],
          [0.4861, 0.3512, 43.6225],
          [0.4862, 0.353, 43.6375],
          [0.4862, 0.3548, 43.6525],
          [0.4862, 0.3566, 43.6675],
          [0.4863, 0.3601, 43.6975],
          [0.4863, 0.3619, 43.7125],
          [0.4864, 0.3637, 43.7275],
          [0.4864, 0.3655, 43.7425],
          [0.4865, 0.3673, 43.7575],
          [0.4865, 0.3691, 43.7725],
          [0.4865, 0.3709, 43.7875],
          [0.4865, 0.3727, 43.8025],
          [0.4866, 0.3762, 43.8325],
          [0.4866, 0.378, 43.8475],
          [0.4866, 0.3798, 43.8625],
          [0.4867, 0.3816, 43.8775],
          [0.4867, 0.3834, 43.8925],
          [0.4867, 0.3852, 43.9075],
          [0.4867, 0.387, 43.9225],
          [0.4868, 0.3888, 43.9375],
          [0.4868, 0.3924, 43.9675],
          [0.4868, 0.3942, 43.9825],
          [0.4869, 0.3959, 43.9975],
          [0.4869, 0.3977, 44.0125],
          [0.4869, 0.3995, 44.0275],
          [0.4869, 0.4013, 44.0425],
          [0.487, 0.4031, 44.0575],
          [0.487, 0.4049, 44.0725],
          [0.487, 0.4085, 44.1025],
          [0.4871, 0.4103, 44.1175],
          [0.4871, 0.4121, 44.1325],
          [0.4871, 0.4139, 44.1475],
          [0.4871, 0.4157, 44.1625],
          [0.4872, 0.4174, 44.1775],
          [0.4872, 0.4192, 44.1925],
          [0.4872, 0.421, 44.2075],
          [0.4873, 0.4246, 44.2375],
          [0.4873, 0.426, 44.2487],
          [0.4873, 0.4269, 44.2563],
          [0.4873, 0.4273, 44.26],
        ],
        [
          [0.6927, 0.5818, 37.25],
          [0.6927, 0.5807, 37.2631],
          [0.6927, 0.5795, 37.2763],
          [0.6927, 0.5763, 37.3113],
          [0.6927, 0.5748, 37.3288],
          [0.6927, 0.5718, 37.3638],
          [0.6927, 0.5702, 37.3813],
          [0.6927, 0.5671, 37.4163],
          [0.6927, 0.564, 37.4513],
          [0.6927, 0.5624, 37.4688],
          [0.6927, 0.5593, 37.5038],
          [0.6927, 0.5577, 37.5206],
          [0.6927, 0.5546, 37.5525],
          [0.6927, 0.553, 37.5675],
          [0.6927, 0.55, 37.5994],
          [0.6927, 0.5468, 37.6338],
          [0.6927, 0.5453, 37.6513],
          [0.6927, 0.5422, 37.6863],
          [0.6927, 0.5406, 37.7038],
          [0.6927, 0.5376, 37.7388],
          [0.6927, 0.536, 37.7563],
          [0.6927, 0.5329, 37.7913],
          [0.6927, 0.5298, 37.8263],
          [0.6927, 0.5283, 37.8438],
          [0.6927, 0.5252, 37.8788],
          [0.6927, 0.5236, 37.8963],
          [0.6927, 0.5205, 37.9313],
          [0.6927, 0.519, 37.9488],
          [0.6927, 0.5159, 37.9838],
          [0.6927, 0.5127, 38.0188],
          [0.6927, 0.5112, 38.0363],
          [0.6927, 0.5081, 38.0706],
          [0.6927, 0.5065, 38.0869],
          [0.6927, 0.5034, 38.1175],
          [0.6927, 0.5018, 38.1331],
          [0.6927, 0.4987, 38.1663],
          [0.6927, 0.4956, 38.2013],
          [0.6927, 0.4941, 38.2188],
          [0.6927, 0.491, 38.2538],
          [0.6927, 0.4894, 38.2713],
          [0.6927, 0.4863, 38.3063],
          [0.6927, 0.4848, 38.3238],
          [0.6927, 0.4817, 38.3588],
          [0.6927, 0.4786, 38.3938],
          [0.6927, 0.477, 38.4113],
          [0.6927, 0.4739, 38.4463],
          [0.6927, 0.4724, 38.4638],
          [0.6927, 0.4693, 38.4988],
          [0.6927, 0.4677, 38.5163],
          [0.6927, 0.4646, 38.5512],
          [0.6927, 0.4615, 38.5863],
          [0.6927, 0.46, 38.6038],
          [0.6927, 0.4568, 38.6369],
          [0.6927, 0.4552, 38.6525],
          [0.6927, 0.4521, 38.6831],
          [0.6927, 0.4506, 38.6994],
          [0.6927, 0.4475, 38.7338],
          [0.6927, 0.4444, 38.7688],
          [0.6927, 0.4428, 38.7863],
          [0.6927, 0.4397, 38.8213],
          [0.6927, 0.4382, 38.8388],
          [0.6927, 0.4351, 38.8738],
          [0.6927, 0.4339, 38.8869],
          [0.6927, 0.4327, 38.9],
        ],
        [
          [0.6836, 0.2836, 46.43],
          [0.6791, 0.2836, 46.655],
          [0.673, 0.2836, 46.8463],
          [0.6675, 0.2848, 46.9363],
          [0.6641, 0.2869, 46.9813],
          [0.6605, 0.2905, 47.015],
          [0.6568, 0.2948, 47.0512],
          [0.6532, 0.3003, 47.085],
          [0.6496, 0.307, 47.1362],
          [0.6466, 0.3154, 47.2063],
          [0.6455, 0.3221, 47.2688],
          [0.6459, 0.3262, 47.31],
          [0.6479, 0.3319, 47.375],
          [0.6517, 0.3388, 47.4244],
          [0.6567, 0.3443, 47.4631],
          [0.6605, 0.3494, 47.4956],
          [0.6641, 0.3531, 47.5331],
          [0.6678, 0.3569, 47.5656],
          [0.6706, 0.3595, 47.5944],
          [0.6757, 0.3617, 47.6275],
          [0.6812, 0.3648, 47.6731],
          [0.6867, 0.3656, 47.7144],
          [0.6935, 0.367, 47.7469],
          [0.6995, 0.3673, 47.7844],
          [0.7078, 0.3673, 47.8181],
          [0.7137, 0.3673, 47.8575],
          [0.7209, 0.3673, 47.9112],
          [0.727, 0.3673, 47.9488],
          [0.7325, 0.3662, 47.985],
          [0.7379, 0.3643, 48.0313],
          [0.7423, 0.3614, 48.075],
          [0.747, 0.3578, 48.1212],
          [0.7505, 0.3537, 48.1588],
          [0.7541, 0.347, 48.2163],
          [0.7564, 0.3416, 48.275],
          [0.757, 0.3361, 48.3112],
          [0.7582, 0.3307, 48.345],
          [0.7582, 0.3252, 48.3812],
          [0.7582, 0.3198, 48.4188],
          [0.7578, 0.3157, 48.4544],
          [0.7561, 0.3103, 48.4969],
          [0.754, 0.3048, 48.5481],
          [0.7505, 0.2993, 48.6056],
          [0.7469, 0.2939, 48.6563],
          [0.7432, 0.2884, 48.7044],
          [0.7395, 0.2833, 48.7469],
          [0.7367, 0.2804, 48.7838],
          [0.7316, 0.2769, 48.8325],
          [0.7261, 0.2747, 48.8681],
          [0.7192, 0.2716, 48.9231],
          [0.7134, 0.2708, 48.99],
          [0.708, 0.2695, 49.0438],
          [0.7025, 0.2691, 49.095],
          [0.6985, 0.2691, 49.1438],
          [0.693, 0.2691, 49.195],
          [0.6863, 0.2691, 49.2413],
          [0.6803, 0.2714, 49.2788],
          [0.6736, 0.275, 49.3275],
          [0.6687, 0.2787, 49.3688],
          [0.665, 0.2823, 49.405],
          [0.6623, 0.285, 49.4313],
          [0.6587, 0.2887, 49.4688],
          [0.6557, 0.293, 49.515],
          [0.6545, 0.2964, 49.54],
        ],
      ],
    },
    { name: "snare", hits: [124.94] },
    { name: "longer key press", hits: [172.03] },
    { name: "bright keys", hits: [75.92] },
    { name: "end", hits: [199.11] },
  ],
  // Layers are named rows on the timeline, drawn bottom to top; each holds shape clips.
  // A clip: el is a coded shape from assets/elements.js; shape is a drawing,
  // shapes/<name>.svg, drawn at each of its spots. On from `from` through `to`:
  // a bar number, or a moment's name to land right on it. in / out: "cut",
  // "fade" or "clap". spotsMode: all (every spot), turns (one per hit of moveOn;
  // moveOn as a number steps every that many beats),
  // one (a single copy moves between spots, switching by jump, blink or slide;
  // moveBars caps the moving). A spot is [x, y, size]; add -1 to mirror it there,
  // then degrees to turn it, then degrees to skew it (a parallelogram lean,
  // + leans the top right, top and bottom kept level). crop: [left, top,
  // right, bottom] (0-1) draws the clip only inside that rectangle. hidden:
  // true keeps a whole layer off the square.
  // keys: [{ at, x, y, size, deg, fade, flip }] ease the clip's place over time
  // (K in the studio); at is "bar:beat" or a moment's name; flip: -1 mirrors
  // from that key on; ease: "line" keeps the approach linear. Keys replace the
  // spot modes. keysFrom names the moment whose drawn path made them: editing
  // that path in the studio re-samples the keys. fx: [{ kind, amount, rate,
  // from, to }] are effects on the shape (spin, breathe, wobble), each running
  // in its own window or the clip's whole life — or with keys of its own:
  // keys: [{ at, amount }], the amount eased over time (0 is off), replacing
  // from/to as the envelope. A fill effect shows the spots one at a time in
  // list order: { kind: "fill", on: a moment (a spot per hit), or every: the
  // grid step in beats; loop: true starts over once all have shown; fade:
  // beats each spot takes to fade in — a lone spot fades in from the clip's
  // start }. A pulse effect on a shape flares a
  // palette slot, or with slot: "shape" the shape itself: mode "flash" shows
  // it only on each hit (its own look, fading out over `beats`), "tint" keeps
  // it showing and washes it toward the pulse color on each hit. A pulse runs
  // between from and until (a bar, included, or a moment); outside, nothing.
  // A clip can wear several, in separate windows (a flash and a tint act
  // together), and a shape pulse can name
  // its spots: [1, 2] (1 is the first). A pulse steps on a moment (on) or on
  // the grid (every: beats). steps: [1, 5], of: 6 has a pulse or a
  // ripple act on only the first and fifth of every six trigger hits, counted
  // from its from (else the clip's start). A ripple effect sends a
  // ring out from the shape's rim on each hit: { kind: "ripple", on: a
  // moment, or every: the grid step in beats, color: a
  // palette slot or a hex, distance: how far it travels,
  // width: its thickness (both in square units), beats: how long it lives,
  // amount: its opacity }, between from and until. A scatter effect lands
  // the spots somewhere new on each hit: { kind: "scatter", on: a moment, or
  // every: the grid step in beats, area: [left, top, right, bottom] (0–1 of
  // the square) they stay inside, apart: true places each spot on its own
  // (else they move together, keeping their layout) } — random, but the
  // same every playback. A trail effect leaves a copy at the next place along
  // a moment's drawing on each hit: { kind: "trail", path: the moment (else
  // the clip's own), on: a moment, or every: the grid step in beats, spacing:
  // how far apart along the drawing, beats: how long each takes to fade out }
  // — the copies take the spots' looks in turn and start over past the end.
  // A follow effect sets a property
  // from the song: { kind: "follow", source: "pitch" | "loudness", target:
  // "height" | "size", mapping: "relative" (lowest hit to min, highest to max)
  // | "absolute", min, max: scales, before, after: the beats read around each
  // hit, anchor: "inner" | "center" | "top" | "bottom" (the edge a height
  // change keeps) }. Pitch comes from waveform recordings. An oscillate
  // effect moves the spots back and forth: { kind: "oscillate", axis: "x" |
  // "y", direction: "mirror" (each away from the middle) | "together",
  // amount: the distance, rate: beats per cycle } — out on the grid, back to
  // rest halfway. A paint effect fills the shape with its own color: { kind:
  // "paint", style: "solid" | "gradient", color: a palette slot or a hex,
  // spread: the gradient's hue range in degrees, drift: turns per bar, spots:
  // which spots it covers, numbered from 1 (all when left out) }.
  layers: [
    {
      name: "background",
      locked: true,
      clips: [
        {
          shape: "background",
          from: 1,
          to: 216,
          spots: [[0.5, 0.5, 0.5]],
          fx: [{ kind: "pulse", on: "Pulse", to: "#ffffff", amount: 0.9, beats: 3, until: 10 }],
        },
      ],
    },
    {
      // Pattern 1, kept in reserve (hidden, on plain bars): two rows of eight
      // parallelograms leaning opposite ways (skew 30 and -30: flat tops and
      // bottoms, sides at 30 degrees), the top row filling rightward, then the
      // bottom row back leftward. One spacing unit throughout: the gap between
      // neighbors (measured square to their sides) equals the gap between rows.
      name: "bongos",
      hidden: true,
      clips: [
        {
          shape: "line",
          from: 4,
          to: 7,
          spots: [
            [0.1779, 0.4049, 0.1023, 1, 0, 30], [0.2699, 0.4049, 0.1023, 1, 0, 30], [0.362, 0.4049, 0.1023, 1, 0, 30], [0.454, 0.4049, 0.1023, 1, 0, 30], [0.546, 0.4049, 0.1023, 1, 0, 30], [0.638, 0.4049, 0.1023, 1, 0, 30], [0.7301, 0.4049, 0.1023, 1, 0, 30], [0.8221, 0.4049, 0.1023, 1, 0, 30],
            [0.8221, 0.5951, 0.1023, 1, 0, -30], [0.7301, 0.5951, 0.1023, 1, 0, -30], [0.638, 0.5951, 0.1023, 1, 0, -30], [0.546, 0.5951, 0.1023, 1, 0, -30], [0.454, 0.5951, 0.1023, 1, 0, -30], [0.362, 0.5951, 0.1023, 1, 0, -30], [0.2699, 0.5951, 0.1023, 1, 0, -30], [0.1779, 0.5951, 0.1023, 1, 0, -30],
          ],
          fx: [
            { kind: "fill", every: 0.25, loop: true },
            { kind: "follow", source: "pitch", target: "height", mapping: "relative", min: 0.45, max: 1, before: 0.1, after: 0.4, anchor: "inner" },
          ],
        },
      ],
    },
    {
      // A band of 45-degree stripes from "bongo drum start" until the "Bongo
      // drums" moment, thickness equal to the gap, cut straight at the band's
      // left and right sides by the crop. Each stripe's length follows the
      // pitch at its hit, stretching from its middle, so the band staggers
      // around its center line.
      name: "stripes",
      clips: [
        {
          shape: "stripe",
          from: "bongo drum start",
          to: "Bongo drums",
          crop: [0.1, 0, 0.9, 1],
          spots: [
            [-0.0515, 0.5, 0.278, 1, 45], [0.022, 0.5, 0.278, 1, 45], [0.0955, 0.5, 0.278, 1, 45], [0.1691, 0.5, 0.278, 1, 45], [0.2426, 0.5, 0.278, 1, 45], [0.3162, 0.5, 0.278, 1, 45], [0.3897, 0.5, 0.278, 1, 45], [0.4632, 0.5, 0.278, 1, 45],
            [0.5368, 0.5, 0.278, 1, 45], [0.6103, 0.5, 0.278, 1, 45], [0.6838, 0.5, 0.278, 1, 45], [0.7574, 0.5, 0.278, 1, 45], [0.8309, 0.5, 0.278, 1, 45], [0.9045, 0.5, 0.278, 1, 45], [0.978, 0.5, 0.278, 1, 45], [1.0515, 0.5, 0.278, 1, 45],
          ],
          fx: [
            { kind: "fill", every: 0.25, loop: true },
            { kind: "follow", source: "pitch", target: "height", mapping: "relative", min: 0.3, max: 1, before: 0.1, after: 0.4, anchor: "center" },
          ],
        },
      ],
    },
    {
      // A bar of four squares across the bottom of the square. On every hit of
      // "Bongo drums" (its tapped sequence, played twice) one of the four,
      // picked at random and never the same twice running, flashes and fades
      // — black at the corners, the gradient in the middle. From bar 11 until
      // the end the whole square is the chromatic gradient, cut in at once; at
      // the heavy kick the "heavy kick" layer takes over the black squares.
      name: "squares",
      clips: [
        {
          shape: "square",
          from: 11,
          to: "end",
          spots: [[0.5, 0.5, 0.5]],
          fx: [{ kind: "paint", style: "gradient", color: "ground", spread: 20, drift: 1.1 }],
        },
        {
          shape: "square",
          from: "Bongo drums",
          to: 14,
          spots: [[0.875, 0.875, 0.125], [0.125, 0.875, 0.125], [0.375, 0.875, 0.125], [0.625, 0.875, 0.125]],
          fx: [
            { kind: "hop", on: "Bongo drums", order: "random" },
            { kind: "pulse", on: "Bongo drums", slot: "shape", mode: "flash", amount: 1, beats: 0.5 },
            { kind: "paint", style: "solid", color: "#000000", spots: [1, 2] },
            { kind: "paint", style: "gradient", color: "ground", spread: 20, drift: 1.25, spots: [3, 4] },
          ],
        },
      ],
    },
    {
      // From the heavy kick until the end, the black squares in their own
      // layer: they stay and pulse by size, swelling on every beat from bar 12
      // and settling (breathe), with a very quick ripple off their rim on the
      // same grid step, so each swell throws one.
      name: "heavy kick",
      clips: [
        {
          shape: "square",
          from: "heavy kick",
          to: "end",
          spots: [[0.875, 0.875, 0.125], [0.125, 0.875, 0.125]],
          fx: [
            { kind: "paint", style: "solid", color: "#000000" },
            { kind: "breathe", amount: 1, rate: 1, from: 12 },
            { kind: "ripple", every: 1, from: 12, color: "#000000", distance: 0.04, width: 0.02, beats: 0.5, amount: 1 },
          ],
        },
      ],
    },
    {
      // From the triangle tick until the line and circle: outline triangles
      // in dreamy 1, 3 and 4 in turn, one every half beat along the triangle
      // tick's drawing, each fading out over three beats.
      name: "triangles",
      clips: [
        {
          shape: "triangle",
          from: "triangle tick",
          to: "line and circle",
          spots: [[0.1784, 0.5335, 0.08], [0.25, 0.5, 0.08], [0.3216, 0.4665, 0.08]],
          fx: [
            { kind: "trail", every: 0.5, spacing: 0.08, beats: 3 },
            { kind: "paint", style: "solid", color: "dreamy1", spots: [1] },
            { kind: "paint", style: "solid", color: "dreamy3", spots: [2] },
            { kind: "paint", style: "solid", color: "dreamy4", spots: [3] },
          ],
        },
      ],
    },
    {
      // From the line and circle until the snare: two lines and two circles,
      // laid out as the moment's drawing has them, where the triangles were,
      // stepping every half beat as the triangles did, and like them each
      // showing on its step and fading out over three beats — the top left
      // line, then the bottom right one, then both circles (washing to white
      // and quickly back, with a quick ripple close to their rim); then the
      // bottom right line, the top left one, the circles again; and around.
      name: "line and circle",
      clips: [
        {
          shape: "stick",
          from: "line and circle",
          to: "snare",
          spots: [[0.1206, 0.3031, 0.075], [0.3271, 0.444, 0.075]],
          fx: [
            {
              kind: "pulse",
              every: 0.5,
              steps: [1, 5],
              of: 6,
              slot: "shape",
              mode: "flash",
              spots: [1],
              amount: 1,
              beats: 3,
            },
            {
              kind: "pulse",
              every: 0.5,
              steps: [2, 4],
              of: 6,
              slot: "shape",
              mode: "flash",
              spots: [2],
              amount: 1,
              beats: 3,
            },
          ],
        },
        {
          shape: "circle",
          from: "line and circle",
          to: "snare",
          spots: [[0.3363, 0.2549, 0.064], [0.1217, 0.4731, 0.064]],
          fx: [
            { kind: "pulse", every: 0.5, steps: [3, 6], of: 6, slot: "shape", mode: "flash", amount: 1, beats: 3 },
            {
              kind: "pulse",
              every: 0.5,
              steps: [3, 6],
              of: 6,
              slot: "shape",
              mode: "tint",
              to: "#ffffff",
              amount: 1,
              beats: 0.75,
            },
            {
              kind: "ripple",
              every: 0.5,
              steps: [3, 6],
              of: 6,
              color: "ink",
              distance: 0.012,
              width: 0.01,
              beats: 0.5,
              amount: 1,
            },
          ],
        },
      ],
    },
    {
      name: "eyes",
      clips: [
        {
          shape: "eye",
          from: 1,
          to: 8,
          out: "fade",
          outBeats: 2,
          spots: [[0.1295, 0.167, 0.0874], [0.8733, 0.1698, 0.085, -1]],
          fx: [{ kind: "hop", on: "eye panning" }],
        },
      ],
    },
  ],
};
