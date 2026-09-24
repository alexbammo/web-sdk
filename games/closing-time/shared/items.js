// Shopping list goods. Each item has a quirk that creates a different co-op problem.
export const ITEMS = {
	candle: {
		label: 'Church Candle',
		model: 'graveyard/candle-multiple',
		size: 0.45,
		spot: 'aisle0',
		quirk: 'light',
		hint: 'Homeware aisle. Lights your way while carried.'
	},
	teddy: {
		label: 'Toy Rabbit',
		model: 'furniture/bear',
		size: 0.55,
		spot: 'aisle2',
		quirk: 'noisy',
		hint: 'Toys aisle. Squeaks while carried - attracts the dead.'
	},
	doll: {
		label: 'Porcelain Doll',
		model: 'holiday/nutcracker',
		size: 0.6,
		spot: 'aisle3',
		quirk: 'noisy',
		hint: 'Baby & Kids aisle. It hums to itself.'
	},
	ring: {
		label: 'Engagement Ring',
		model: 'ring',
		size: 0.25,
		spot: 'jewellery',
		quirk: 'case',
		hint: 'Jewellery kiosk. Hold E to force the display case. Someone is still waiting at the altar.'
	},
	meat: {
		label: 'Frozen Leg of Lamb',
		model: 'food/whole-ham',
		size: 0.8,
		spot: 'freezer',
		quirk: 'bulky',
		hint: 'Freezer section. Heavy - carry it with a teammate beside you.'
	},
	water: {
		label: 'Bottled Water',
		model: 'food/soda-bottle',
		size: 0.45,
		spot: 'aisle4',
		quirk: 'none',
		hint: 'Drinks aisle.'
	},
	medicine: {
		label: 'Painkillers',
		model: 'pills',
		size: 0.3,
		spot: 'pharmacy',
		quirk: 'guarded',
		hint: 'Pharmacy. Something behind the counter does not want you to take them.'
	},
	chicken: {
		label: 'Roast Chicken',
		model: 'food/turkey',
		size: 0.6,
		spot: 'deli',
		quirk: 'none',
		hint: 'Hot deli counter at the back.'
	}
};

export const BATTERY = { label: 'Torch Battery', model: 'battery', size: 0.22 };

export const LIST_SIZE = 5;
export const CARRY_SLOTS = 2;
export const slotsFor = (type) => (ITEMS[type]?.quirk === 'bulky' ? 2 : 1);
