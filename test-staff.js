fetch("http://localhost:3000/api/sheet?tab=staff")
  .then(res => res.json())
  .then(data => console.log(JSON.stringify(data.employees, null, 2)))
  .catch(err => console.error(err));
