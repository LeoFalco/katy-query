# KatyQuery
:microphone: KatyQuery: is a JavaScript 'n SQL utility library

### Record set result to javascript objects

Given input:

```
  SELECT 
    tasks.id "this.id",
    tasks.description "this.description",
    tasks.status "this.status",
    employees.id "this.employee.id",
    employees.name "this.employee.name",
    tags.id "this.tags[].id",
    tags.name "this.tags[].name"
  FROM
     tasks
   LEFT JOIN employees ON tasks.employeeId = employees.id
   LEFT JOIN tasks_tags ON tasks_tags.taskId = tasks.id
   LEFT JOIN tags ON tasks_tags.tagId = tags.id
  WHERE
    tasks.id = 15
```

Output should be:

```
{
  id: 1,
  description: 'task description',
  status: 'done',
  employee: { 
    id: 2,
    name: 'Luiz Freneda'
  },
  tags: [
    { id: 3, name: 'katy' },
    { id: 4, name: 'query' }
  ]
}
```

### Credits

named by [@maurogarcia](http://github.com/maurogarcia)
