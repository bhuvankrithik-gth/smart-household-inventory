export interface Recipe { id:string; name:string; minutes:number; servings:number; ingredients:{name:string; qty:number; unit:string; optional?:boolean; substitute?:string}[]; steps:string[] }
export const RECIPES: Recipe[] = [
 { id:'r1', name:'Vegetable Khichdi', minutes:30, servings:2, ingredients:[{name:'Rice',qty:200,unit:'g'},{name:'Moong Dal',qty:100,unit:'g'},{name:'Potato',qty:1,unit:'pcs'},{name:'Onion',qty:1,unit:'pcs'},{name:'Turmeric Powder',qty:2,unit:'g',optional:true}], steps:['Wash rice and dal.','Pressure-cook with chopped vegetables, salt and turmeric for 3 whistles.','Temper with ghee/oil and cumin if available. Serve hot.'] },
 { id:'r2', name:'Aloo Paratha', minutes:35, servings:2, ingredients:[{name:'Atta (Whole Wheat Flour)',qty:250,unit:'g'},{name:'Potato',qty:3,unit:'pcs'},{name:'Onion',qty:1,unit:'pcs'},{name:'Sunflower Oil',qty:20,unit:'ml'}], steps:['Knead atta dough, rest 15 min.','Mash boiled potato with onion, salt and spices.','Roll, stuff, shallow-fry with oil until golden.'] },
 { id:'r3', name:'Dal Tadka', minutes:25, servings:2, ingredients:[{name:'Toor Dal',qty:200,unit:'g'},{name:'Tomato',qty:2,unit:'pcs'},{name:'Onion',qty:1,unit:'pcs'},{name:'Turmeric Powder',qty:2,unit:'g',optional:true},{name:'Sunflower Oil',qty:15,unit:'ml'}], steps:['Pressure-cook dal with turmeric.','Fry onion and tomato, add to dal.','Simmer 5 minutes, adjust salt.'] },
 { id:'r4', name:'Veg Fried Rice', minutes:20, servings:2, ingredients:[{name:'Rice',qty:250,unit:'g'},{name:'Carrot',qty:2,unit:'pcs'},{name:'Onion',qty:1,unit:'pcs'},{name:'Sunflower Oil',qty:20,unit:'ml'}], steps:['Cook rice and cool it.','Stir-fry vegetables on high heat.','Toss rice with soy/salt, serve.'] },
 { id:'r5', name:'Poha', minutes:15, servings:2, ingredients:[{name:'Rice',qty:150,unit:'g'},{name:'Onion',qty:1,unit:'pcs'},{name:'Potato',qty:1,unit:'pcs'},{name:'Turmeric Powder',qty:2,unit:'g',optional:true}], steps:['Rinse flattened rice (poha) — white rice is listed as a close pantry proxy; use poha if you have it.','Fry potato and onion.','Add poha and turmeric, mix and steam 2 minutes.'] },
 { id:'r6', name:'Paneer Bhurji (if paneer available)', minutes:20, servings:2, ingredients:[{name:'Milk',qty:500,unit:'ml'},{name:'Tomato',qty:2,unit:'pcs'},{name:'Onion',qty:1,unit:'pcs'}], steps:['Curdle milk to make fresh paneer, or use stored paneer.','Fry onion and tomato masala.','Crumble paneer in, cook 5 minutes.'] },
];
export interface ScoredRecipe { recipe:Recipe; available:string[]; missing:{name:string;qty:number;unit:string}[]; expiringUsed:string[]; score:number }
export function scoreRecipes(availableNames:{name:string; expiring:boolean}[]):ScoredRecipe[]{
  const norm=(s:string)=>s.toLowerCase();
  return RECIPES.map(r=>{
    const available:string[]=[]; const missing:ScoredRecipe['missing']=[]; const expiringUsed:string[]=[];
    r.ingredients.forEach(ing=>{ const hit=availableNames.find(a=>norm(a.name)===norm(ing.name)||norm(a.name).includes(norm(ing.name))||norm(ing.name).includes(norm(a.name))); if(hit && !ing.optional){ available.push(ing.name); if(hit.expiring) expiringUsed.push(ing.name); } else if(!ing.optional){ missing.push({name:ing.name,qty:ing.qty,unit:ing.unit}); } });
    const score = available.length*10 + expiringUsed.length*15 - missing.length*8;
    return { recipe:r, available, missing, expiringUsed, score };
  }).sort((a,b)=>b.score-a.score);
}
