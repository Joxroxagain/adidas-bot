var Table = require('easy-table')

var api = {};
var tasks = new Table;
var sizes = new Table;

var data = [
    { id: 123123, desc: 'Something awesome', price: 1000.00 },
    { id: 245452, desc: 'Very interesting book', price: 11.45 },
    { id: 232323, desc: 'Yet another product', price: 555.55 }
]

function print() {
    console.log()
}

api.updatetable = (data) => {
    data.forEach(function (product) {
        tasks.cell('Product Id', product.id)
        tasks.cell('Description', product.desc)
        tasks.cell('Price, USD', product.price, Table.number(2))
        tasks.newRow()
    })
    console.log(tasks.toString())
}

api.updateLog = (data) => {
    console.log(data)
}

api.updateSizes= (data) => {
    console.log(t.toString())
    console.log(data)
}

module.exports = api;





